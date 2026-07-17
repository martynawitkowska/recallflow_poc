import { isTauri } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import {
  type Store,
  Stronghold,
} from "@tauri-apps/plugin-stronghold";
import { invokeIpc } from "./ipc.ts";
import type { MnemonicProvider } from "./mnemonicProviders.ts";

const VAULT_FILE = "recallflow-secrets-v1.hold";
const VAULT_PASSWORD_STORAGE_KEY = "recallflow-stronghold-password-v1";
const LEGACY_VAULT_FILE = "recallflow-secrets.hold";
const LEGACY_VAULT_CONFIGURED_KEY = "recallFlowOpenAiVaultConfigured";
const LEGACY_PASSWORD_PREFIX = "recallflow-legacy:";
const CLIENT_NAME = "recallflow";
const DESKTOP_REQUIRED_MESSAGE =
  "Encrypted API key storage requires the RecallFlow desktop app.";
const VAULT_WRITE_ERROR =
  "RecallFlow could not save the API key securely. Restart the app and try again.";
const VAULT_READ_ERROR =
  "RecallFlow could not open the encrypted API key vault. Restore access or remove the vault before saving keys again.";
const INVALID_API_KEY_ERROR = "Enter a valid API key without spaces.";
const LEGACY_PASSWORD_ERROR =
  "Enter the master password previously used for RecallFlow.";
const LEGACY_VAULT_READ_ERROR =
  "RecallFlow could not unlock the old OpenAI vault. Check the previous master password.";
const LEGACY_KEY_MISSING_ERROR =
  "The old OpenAI vault does not contain an API key.";
const LEGACY_KEY_INVALID_ERROR =
  "The old OpenAI vault does not contain a valid API key.";

export const apiKeyRecordNames: Readonly<Record<MnemonicProvider, string>> = {
  openai: "openai-api-key",
  gemini: "gemini-api-key",
  claude: "claude-api-key",
};

type RustApiKeyStatus = {
  configured: boolean;
  maskedKey: string | null;
};

export type ApiKeyStatus = RustApiKeyStatus & {
  needsMigration: boolean;
  persisted: boolean;
};

export type ApiKeyRestoreReport = {
  failedProviders: MnemonicProvider[];
  restoredProviders: MnemonicProvider[];
};

type OpenVault = {
  stronghold: Stronghold;
  store: Store;
};

let activeVault: Promise<OpenVault> | null = null;

const apiKeyProviders = Object.keys(apiKeyRecordNames) as MnemonicProvider[];

function requireDesktop() {
  if (!isTauri()) {
    throw new Error(DESKTOP_REQUIRED_MESSAGE);
  }
}

export function normalizeApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (normalized.length < 20 || /\s/.test(normalized)) {
    throw new Error(INVALID_API_KEY_ERROR);
  }
  return normalized;
}

function getVaultPassword(create: boolean) {
  const saved = window.localStorage.getItem(VAULT_PASSWORD_STORAGE_KEY);
  if (saved) {
    if (!/^[a-f0-9]{64}$/.test(saved)) {
      throw new Error(VAULT_READ_ERROR);
    }
    return saved;
  }
  if (!create) {
    return null;
  }

  const password = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  window.localStorage.setItem(VAULT_PASSWORD_STORAGE_KEY, password);
  return password;
}

async function loadVault(
  password: string,
  vaultFile = VAULT_FILE,
  createClient = true,
): Promise<OpenVault> {
  const vaultPath = await join(await appDataDir(), vaultFile);
  const stronghold = await Stronghold.load(vaultPath, password);
  let client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
    if (!createClient) {
      await stronghold.unload();
      throw new Error(LEGACY_VAULT_READ_ERROR);
    }
    client = await stronghold.createClient(CLIENT_NAME);
  }
  return { stronghold, store: client.getStore() };
}

async function openVault(create: boolean): Promise<OpenVault | null> {
  try {
    const password = getVaultPassword(create);
    if (!password) {
      return null;
    }
    if (!activeVault) {
      activeVault = loadVault(password);
    }
    return await activeVault;
  } catch {
    activeVault = null;
    throw new Error(VAULT_READ_ERROR);
  }
}

async function unloadActiveVault() {
  const vault = activeVault;
  activeVault = null;
  if (vault) {
    try {
      await (await vault).stronghold.unload();
    } catch {
      // The Rust reset command remains the source of truth for recovery.
    }
  }
}

export function legacyOpenAiVaultNeedsMigration() {
  try {
    return window.localStorage.getItem(LEGACY_VAULT_CONFIGURED_KEY) === "true";
  } catch {
    return false;
  }
}

export async function restoreStoredApiKeys(
  getStoredKey: (provider: MnemonicProvider) => Promise<Uint8Array | null>,
  saveSessionKey: (
    provider: MnemonicProvider,
    apiKey: string,
  ) => Promise<unknown>,
): Promise<ApiKeyRestoreReport> {
  const report: ApiKeyRestoreReport = {
    failedProviders: [],
    restoredProviders: [],
  };

  for (const provider of apiKeyProviders) {
    try {
      const storedKey = await getStoredKey(provider);
      if (!storedKey) {
        continue;
      }
      const apiKey = normalizeApiKey(
        new TextDecoder("utf-8", { fatal: true }).decode(storedKey),
      );
      await saveSessionKey(provider, apiKey);
      report.restoredProviders.push(provider);
    } catch {
      report.failedProviders.push(provider);
    }
  }

  return report;
}

export async function restoreApiKeys(): Promise<ApiKeyRestoreReport> {
  requireDesktop();
  const vault = await openVault(false);
  if (!vault) {
    return { failedProviders: [], restoredProviders: [] };
  }

  return restoreStoredApiKeys(
    (provider) => vault.store.get(apiKeyRecordNames[provider]),
    (provider, apiKey) =>
      invokeIpc<RustApiKeyStatus>(
        "save_ai_api_key",
        { provider, apiKey },
        "RecallFlow could not restore a saved API key for this session. Restart the app and try again.",
      ),
  );
}

export async function migrateStoredOpenAiApiKey(
  readLegacyKey: () => Promise<Uint8Array | null>,
  saveCurrentKey: (apiKey: string) => Promise<ApiKeyStatus>,
  removeLegacyVault: () => Promise<void>,
): Promise<ApiKeyStatus> {
  const storedKey = await readLegacyKey();
  if (!storedKey) {
    throw new Error(LEGACY_KEY_MISSING_ERROR);
  }

  let apiKey;
  try {
    apiKey = normalizeApiKey(
      new TextDecoder("utf-8", { fatal: true }).decode(storedKey),
    );
  } catch {
    throw new Error(LEGACY_KEY_INVALID_ERROR);
  }
  const status = await saveCurrentKey(apiKey);
  await removeLegacyVault();
  return status;
}

async function removeLegacyOpenAiVault() {
  await invokeIpc<void>(
    "remove_legacy_openai_vault",
    undefined,
    "RecallFlow migrated the API key but could not remove the old vault. Restart the app and try again.",
    true,
  );
  window.localStorage.removeItem(LEGACY_VAULT_CONFIGURED_KEY);
}

export async function migrateLegacyOpenAiApiKey(
  masterPassword: string,
): Promise<ApiKeyStatus> {
  requireDesktop();
  if (masterPassword.length < 8) {
    throw new Error(LEGACY_PASSWORD_ERROR);
  }

  return migrateStoredOpenAiApiKey(
    async () => {
      let legacyVault: OpenVault | null = null;
      try {
        legacyVault = await loadVault(
          `${LEGACY_PASSWORD_PREFIX}${masterPassword}`,
          LEGACY_VAULT_FILE,
          false,
        );
        return await legacyVault.store.get(apiKeyRecordNames.openai);
      } catch {
        throw new Error(LEGACY_VAULT_READ_ERROR);
      } finally {
        if (legacyVault) {
          try {
            await legacyVault.stronghold.unload();
          } catch {
            throw new Error(LEGACY_VAULT_READ_ERROR);
          }
        }
      }
    },
    (apiKey) => saveApiKeyInternal("openai", apiKey, false),
    removeLegacyOpenAiVault,
  );
}

export async function resetApiKeyVault(): Promise<void> {
  requireDesktop();
  await unloadActiveVault();
  await invokeIpc<void>(
    "reset_api_key_vault",
    undefined,
    "RecallFlow could not reset the encrypted API key vault. Close other app windows and try again.",
    true,
  );
  window.localStorage.removeItem(VAULT_PASSWORD_STORAGE_KEY);
}

export async function getApiKeyStatus(
  provider: MnemonicProvider,
): Promise<ApiKeyStatus> {
  requireDesktop();
  const status = await invokeIpc<RustApiKeyStatus>(
    "get_ai_api_key_status",
    { provider },
    "RecallFlow could not read the API key status. Restart the app and try again.",
    true,
  );

  const vault = await openVault(false);
  let persisted = false;
  if (vault) {
    try {
      persisted = Boolean(await vault.store.get(apiKeyRecordNames[provider]));
    } catch {
      throw new Error(VAULT_READ_ERROR);
    }
  }
  const needsMigration =
    provider === "openai" && legacyOpenAiVaultNeedsMigration();
  return {
    ...status,
    needsMigration,
    persisted: persisted || needsMigration,
  };
}

async function saveApiKeyInternal(
  provider: MnemonicProvider,
  apiKey: string,
  removeLegacy: boolean,
): Promise<ApiKeyStatus> {
  requireDesktop();
  const normalized = normalizeApiKey(apiKey);
  const vault = await openVault(true);
  if (!vault) {
    throw new Error(VAULT_WRITE_ERROR);
  }

  try {
    await vault.store.insert(
      apiKeyRecordNames[provider],
      Array.from(new TextEncoder().encode(normalized)),
    );
    await vault.stronghold.save();
  } catch {
    throw new Error(VAULT_WRITE_ERROR);
  }

  const status = await invokeIpc<RustApiKeyStatus>(
    "save_ai_api_key",
    { provider, apiKey: normalized },
    "RecallFlow saved the encrypted key but could not use it in this session. Restart the app and try again.",
    true,
  );
  if (
    removeLegacy &&
    provider === "openai" &&
    legacyOpenAiVaultNeedsMigration()
  ) {
    await removeLegacyOpenAiVault();
  }
  return { ...status, needsMigration: false, persisted: true };
}

export async function saveApiKey(
  provider: MnemonicProvider,
  apiKey: string,
): Promise<ApiKeyStatus> {
  return saveApiKeyInternal(provider, apiKey, true);
}

export async function deleteApiKey(
  provider: MnemonicProvider,
): Promise<ApiKeyStatus> {
  requireDesktop();
  const vault = await openVault(false);
  if (vault) {
    try {
      await vault.store.remove(apiKeyRecordNames[provider]);
      await vault.stronghold.save();
    } catch {
      throw new Error(
        "RecallFlow could not remove the saved API key. Restart the app and try again.",
      );
    }
  }

  const status = await invokeIpc<RustApiKeyStatus>(
    "delete_ai_api_key",
    { provider },
    "RecallFlow could not remove the API key from this session. Restart the app and try again.",
    true,
  );
  if (provider === "openai" && legacyOpenAiVaultNeedsMigration()) {
    await removeLegacyOpenAiVault();
  }
  return { ...status, needsMigration: false, persisted: false };
}

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
const CLIENT_NAME = "recallflow";
const DESKTOP_REQUIRED_MESSAGE =
  "Encrypted API key storage requires the RecallFlow desktop app.";
const VAULT_WRITE_ERROR =
  "RecallFlow could not save the API key securely. Restart the app and try again.";
const VAULT_READ_ERROR =
  "RecallFlow could not open the encrypted API key vault. Restore access or remove the vault before saving keys again.";
const INVALID_API_KEY_ERROR = "Enter a valid API key without spaces.";

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

async function loadVault(password: string): Promise<OpenVault> {
  const vaultPath = await join(await appDataDir(), VAULT_FILE);
  const stronghold = await Stronghold.load(vaultPath, password);
  let client;
  try {
    client = await stronghold.loadClient(CLIENT_NAME);
  } catch {
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
  return {
    ...status,
    persisted,
  };
}

export async function saveApiKey(
  provider: MnemonicProvider,
  apiKey: string,
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
  return { ...status, persisted: true };
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
  return { ...status, persisted: false };
}

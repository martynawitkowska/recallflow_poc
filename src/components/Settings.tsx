import {
  getMnemonicModelOption,
  getMnemonicProviderOption,
  isMnemonicModelForProvider,
  isMnemonicProvider,
  mnemonicProviderOptions,
  type MnemonicModel,
  type MnemonicProvider,
} from "../lib/mnemonicProviders";
import {
  isReadingFont,
  readingFontOptions,
  type ReadingFont,
} from "../lib/appPreferences";
import { useApiKeySettings } from "../hooks/useApiKeySettings";

type SettingsProps = {
  aiAvailable: boolean;
  model: MnemonicModel;
  onModelChange: (model: MnemonicModel) => void;
  onProviderChange: (provider: MnemonicProvider) => void;
  onReadingFontChange: (font: ReadingFont) => void;
  onStartInFocusModeChange: (enabled: boolean) => void;
  provider: MnemonicProvider;
  readingFont: ReadingFont;
  startInFocusMode: boolean;
  webQuizGenerationAvailable?: boolean;
};

export default function Settings({
  aiAvailable,
  model,
  onModelChange,
  onProviderChange,
  onReadingFontChange,
  onStartInFocusModeChange,
  provider,
  readingFont,
  startInFocusMode,
  webQuizGenerationAvailable = false,
}: SettingsProps) {
  return (
    <section className="narrow-page" aria-labelledby="settings-title">
      <h1 id="settings-title" tabIndex={-1}>
        Settings
      </h1>
      <p className="lede">
        {aiAvailable
          ? "Personalize reading and study sessions, then choose the AI used for mnemonic generation."
          : "Personalize reading and study sessions in this browser preview."}
      </p>

      <section className="settings-card" aria-labelledby="typography-title">
        <h2 id="typography-title">Typography</h2>
        <p>Choose the font used throughout RecallFlow.</p>
        <label htmlFor="reading-font">Reading font</label>
        <select
          id="reading-font"
          onChange={(event) => {
            if (isReadingFont(event.target.value)) {
              onReadingFontChange(event.target.value);
            }
          }}
          value={readingFont}
        >
          {readingFontOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-card" aria-labelledby="study-title">
        <h2 id="study-title">Study sessions</h2>
        <label className="settings-toggle">
          <input
            checked={startInFocusMode}
            onChange={(event) =>
              onStartInFocusModeChange(event.target.checked)
            }
            type="checkbox"
          />
          <span>
            <strong>Start quizzes in focus mode</strong>
            <small>
              Hide navigation when a quiz starts. You can exit focus mode at
              any time.
            </small>
          </span>
        </label>
      </section>

      {aiAvailable ? (
        <DesktopAiSettings
          model={model}
          onModelChange={onModelChange}
          onProviderChange={onProviderChange}
          provider={provider}
        />
      ) : (
        <section className="settings-card" aria-labelledby="ai-settings-title">
          <h2 id="ai-settings-title">AI features</h2>
          <p>
            {webQuizGenerationAvailable
              ? "Limited quiz generation is available through a server-side OpenAI connection. Mnemonic generation remains desktop-only. The preview does not accept or store API keys."
              : "AI quiz and mnemonic generation are available in the desktop app. RecallFlow Web Preview does not accept or store API keys."}
          </p>
        </section>
      )}

      <section className="settings-card" aria-labelledby="security-title">
        <h2 id="security-title">Privacy and storage</h2>
        {aiAvailable ? (
          <>
            <p>RecallFlow is local-first, but AI generation uses the network.</p>
            <ul className="settings-security-list">
              <li>
                <strong>Preferences</strong> stay in the local app profile.
              </li>
              <li>
                <strong>Quizzes, results, and saved mnemonics</strong> stay in
                the local SQLite library.
              </li>
              <li>
                <strong>API keys</strong> are stored in the operating system
                credential store.
              </li>
            </ul>
            <p className="settings-privacy">
              Study content is sent to the selected provider only when you
              choose Generate. Nothing is uploaded automatically.
            </p>
          </>
        ) : (
          <p>
            Quizzes, results, and preferences are stored in this browser only.
            Clearing browser data removes them.
            {webQuizGenerationAvailable
              ? " Pasted material is sent to OpenAI only when you choose Generate."
              : " Nothing is uploaded by the preview."}
          </p>
        )}
      </section>
    </section>
  );
}

type DesktopAiSettingsProps = Pick<
  SettingsProps,
  "model" | "onModelChange" | "onProviderChange" | "provider"
>;

function DesktopAiSettings({
  model,
  onModelChange,
  onProviderChange,
  provider,
}: DesktopAiSettingsProps) {
  const providerOption = getMnemonicProviderOption(provider);
  const modelOption = getMnemonicModelOption(provider, model);
  const apiKeySettings = useApiKeySettings(provider);
  const keyStatus =
    apiKeySettings.state.status === "ready" ||
    apiKeySettings.state.status === "saving"
      ? apiKeySettings.state.key
      : null;
  const canManageKey = apiKeySettings.state.status === "ready";
  const isSavingKey = apiKeySettings.state.status === "saving";

  return (
    <section className="settings-card" aria-labelledby="ai-settings-title">
        <h2 id="ai-settings-title">AI provider</h2>
        <p>Choose the provider and model used to create mnemonics.</p>
        <label htmlFor="ai-provider">Provider</label>
        <select
          id="ai-provider"
          onChange={(event) => {
            if (isMnemonicProvider(event.target.value)) {
              onProviderChange(event.target.value);
            }
          }}
          value={provider}
        >
          {mnemonicProviderOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="mnemonic-model">Mnemonic model</label>
        <select
          aria-describedby="mnemonic-model-description"
          id="mnemonic-model"
          onChange={(event) => {
            if (isMnemonicModelForProvider(provider, event.target.value)) {
              onModelChange(event.target.value);
            }
          }}
          value={model}
        >
          {providerOption.models.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="field-hint" id="mnemonic-model-description">
          {modelOption.description}
        </p>

        <label htmlFor="ai-api-key">
          {keyStatus?.configured === true
            ? `Replace ${providerOption.label} API key`
            : providerOption.keyLabel}
        </label>
        <input
          autoComplete="off"
          disabled={!canManageKey || isSavingKey}
          id="ai-api-key"
          onChange={(event) => apiKeySettings.setApiKey(event.target.value)}
          placeholder={providerOption.keyPlaceholder}
          spellCheck={false}
          type="password"
          value={apiKeySettings.apiKey}
        />
        <div className="settings-key-actions">
          {canManageKey && keyStatus?.configured !== false && (
            <button
              className="danger-button"
              disabled={isSavingKey}
              onClick={() => void apiKeySettings.remove()}
              type="button"
            >
              Remove saved key
            </button>
          )}
          <button
            className="primary-button"
            disabled={
              !canManageKey || !apiKeySettings.apiKey.trim() || isSavingKey
            }
            onClick={() => void apiKeySettings.save()}
            type="button"
          >
            {isSavingKey
              ? "Saving…"
              : keyStatus?.configured === true
                ? "Replace key"
                : keyStatus?.configured === false
                  ? "Save API key"
                  : "Save or replace key"}
          </button>
        </div>
        {apiKeySettings.state.status === "loading" && (
          <p role="status">Loading API key settings…</p>
        )}
        {keyStatus?.configured === true && keyStatus.maskedKey && (
          <p className="settings-privacy" role="status">
            Saved as {keyStatus.maskedKey}. RecallFlow will reuse it automatically.
          </p>
        )}
        {apiKeySettings.state.status === "ready" &&
          apiKeySettings.state.message && (
            <p className="management-status" role="status">
              {apiKeySettings.state.message}
            </p>
          )}
        {apiKeySettings.state.status === "ready" &&
          apiKeySettings.state.error && (
            <p className="management-status management-status-error" role="alert">
              {apiKeySettings.state.error}
            </p>
          )}
        {apiKeySettings.state.status === "error" && (
          <p className="management-status management-status-error" role="alert">
            {apiKeySettings.state.message}
          </p>
        )}
    </section>
  );
}

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

type SettingsProps = {
  model: MnemonicModel;
  onModelChange: (model: MnemonicModel) => void;
  onProviderChange: (provider: MnemonicProvider) => void;
  onReadingFontChange: (font: ReadingFont) => void;
  onStartInFocusModeChange: (enabled: boolean) => void;
  provider: MnemonicProvider;
  readingFont: ReadingFont;
  startInFocusMode: boolean;
};

export default function Settings({
  model,
  onModelChange,
  onProviderChange,
  onReadingFontChange,
  onStartInFocusModeChange,
  provider,
  readingFont,
  startInFocusMode,
}: SettingsProps) {
  const providerOption = getMnemonicProviderOption(provider);
  const modelOption = getMnemonicModelOption(provider, model);

  return (
    <section className="narrow-page" aria-labelledby="settings-title">
      <p className="eyebrow">Application preferences</p>
      <h1 id="settings-title">Settings</h1>
      <p className="lede">
        Personalize reading and study sessions, then choose the AI used for
        mnemonic generation.
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

        <div className="settings-selection" aria-live="polite" role="status">
          <strong>
            {providerOption.label} · {modelOption.label}
          </strong>
          <p>This selection will be used for new mnemonic requests.</p>
        </div>
        <p className="settings-privacy">
          This provider and model selection contains no credentials.
        </p>
      </section>

      <section className="settings-card" aria-labelledby="security-title">
        <h2 id="security-title">Privacy and security</h2>
        <p>RecallFlow is local-first, but AI generation uses the network.</p>
        <ul className="settings-security-list">
          <li>
            <strong>Preferences</strong> stay in the local app profile.
          </li>
          <li>
            <strong>Quizzes, results, and saved mnemonics</strong> stay in the
            local SQLite library.
          </li>
          <li>
            <strong>API keys</strong> are held temporarily for a generation
            request and are not saved to local storage or SQLite.
          </li>
        </ul>
        <p className="settings-privacy">
          When you choose Generate, the relevant study content and API key are
          sent to the selected provider. Nothing is uploaded automatically.
        </p>
      </section>
    </section>
  );
}

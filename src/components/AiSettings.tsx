import {
  getMnemonicModelOption,
  getMnemonicProviderOption,
  isMnemonicModelForProvider,
  isMnemonicProvider,
  mnemonicProviderOptions,
  type MnemonicModel,
  type MnemonicProvider,
} from "../lib/mnemonicProviders";

type AiSettingsProps = {
  model: MnemonicModel;
  onModelChange: (model: MnemonicModel) => void;
  onProviderChange: (provider: MnemonicProvider) => void;
  provider: MnemonicProvider;
};

export default function AiSettings({
  model,
  onModelChange,
  onProviderChange,
  provider,
}: AiSettingsProps) {
  const providerOption = getMnemonicProviderOption(provider);
  const modelOption = getMnemonicModelOption(provider, model);

  return (
    <section className="narrow-page" aria-labelledby="ai-settings-title">
      <p className="eyebrow">Provider configuration</p>
      <h1 id="ai-settings-title">AI settings</h1>
      <p className="lede">
        Choose the provider and model RecallFlow uses to create mnemonics.
      </p>
      <div className="settings-card">
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
          RecallFlow saves only this preference. API keys are entered for each
          request and are never saved by this setting.
        </p>
      </div>
    </section>
  );
}

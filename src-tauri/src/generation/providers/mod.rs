mod openai;

use super::{GenerationPrompt, MnemonicPrompt};
use crate::models::AiProvider;

pub(super) async fn generate(
    provider: AiProvider,
    model: Option<&str>,
    api_key: &str,
    prompt: &GenerationPrompt,
) -> Result<String, String> {
    match provider {
        AiProvider::Openai => openai::generate(api_key, model, prompt).await,
        AiProvider::Unsupported => {
            Err("The selected quiz provider is not available yet.".to_owned())
        }
    }
}

pub(super) async fn generate_mnemonic(
    provider: AiProvider,
    model: Option<&str>,
    api_key: &str,
    prompt: &MnemonicPrompt,
) -> Result<String, String> {
    match provider {
        AiProvider::Openai => openai::generate_mnemonic(api_key, model, prompt).await,
        AiProvider::Unsupported => {
            Err("The selected mnemonic provider is not available yet.".to_owned())
        }
    }
}

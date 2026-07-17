mod claude;
mod gemini;
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
        AiProvider::Gemini | AiProvider::Claude | AiProvider::Unsupported => {
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
        AiProvider::Gemini => gemini::generate_mnemonic(api_key, model, prompt).await,
        AiProvider::Claude => claude::generate_mnemonic(api_key, model, prompt).await,
        AiProvider::Unsupported => {
            Err("The selected mnemonic provider is not available yet.".to_owned())
        }
    }
}

pub(super) async fn generate_candidates(
    provider: AiProvider,
    model: Option<&str>,
    api_key: &str,
    prompt: &super::CandidatePrompt,
) -> Result<String, String> {
    match provider {
        AiProvider::Openai => openai::generate_candidates(api_key, model, prompt).await,
        _ => Err("The selected quiz provider is not available yet.".to_owned()),
    }
}

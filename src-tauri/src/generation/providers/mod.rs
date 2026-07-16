mod openai;

use super::GenerationPrompt;
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

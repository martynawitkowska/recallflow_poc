use super::super::MnemonicPrompt;
use serde::Deserialize;
use std::time::Duration;

const DEFAULT_MODEL: &str = "gemini-3.5-flash";
const ALLOWED_MODELS: &[&str] = &[
    DEFAULT_MODEL,
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
];
const REQUEST_TIMEOUT_SECONDS: u64 = 120;
const MAX_RESPONSE_BYTES: usize = 1_000_000;
const GENERATION_ERROR: &str =
    "Gemini could not generate a mnemonic. Check your connection and try again.";
const TIMEOUT_ERROR: &str = "Gemini took too long to generate a mnemonic. Try again.";
const RESPONSE_TOO_LARGE_ERROR: &str = "Gemini returned too much data. Try again.";
const EMPTY_RESPONSE_ERROR: &str = "Gemini did not return a mnemonic. Try again.";

#[derive(Deserialize)]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}

#[derive(Deserialize)]
struct GeminiContent {
    #[serde(default)]
    parts: Vec<GeminiPart>,
}

#[derive(Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

fn validate_model(model: Option<&str>) -> Result<&'static str, String> {
    let model = model
        .map(str::trim)
        .filter(|model| !model.is_empty())
        .unwrap_or(DEFAULT_MODEL);

    ALLOWED_MODELS
        .iter()
        .copied()
        .find(|allowed| *allowed == model)
        .ok_or_else(|| {
            format!(
                "Choose a supported Gemini model: {}.",
                ALLOWED_MODELS.join(", ")
            )
        })
}

fn build_payload(prompt: &MnemonicPrompt) -> serde_json::Value {
    serde_json::json!({
        "systemInstruction": {
            "parts": [{ "text": prompt.instructions }]
        },
        "contents": [{
            "role": "user",
            "parts": [{ "text": prompt.input }]
        }],
        "generationConfig": {
            "maxOutputTokens": prompt.max_output_tokens,
            "temperature": 0.7
        }
    })
}

fn extract_text(response: GeminiResponse) -> Result<String, String> {
    let text = response
        .candidates
        .into_iter()
        .next()
        .and_then(|candidate| candidate.content)
        .into_iter()
        .flat_map(|content| content.parts)
        .filter_map(|part| part.text)
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    if text.is_empty() {
        Err(EMPTY_RESPONSE_ERROR.to_owned())
    } else {
        Ok(text)
    }
}

fn status_error(status: reqwest::StatusCode) -> String {
    match status {
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN => {
            "Gemini rejected the API key. Check it and try again.".to_owned()
        }
        reqwest::StatusCode::TOO_MANY_REQUESTS => {
            "Gemini is rate limiting requests. Wait a moment and try again.".to_owned()
        }
        reqwest::StatusCode::BAD_REQUEST | reqwest::StatusCode::NOT_FOUND => {
            "The selected Gemini model is unavailable. Try again later.".to_owned()
        }
        reqwest::StatusCode::REQUEST_TIMEOUT => TIMEOUT_ERROR.to_owned(),
        status if status.is_server_error() => {
            "Gemini is temporarily unavailable. Wait a moment and try again.".to_owned()
        }
        _ => GENERATION_ERROR.to_owned(),
    }
}

async fn send(api_key: &str, model: &str, payload: serde_json::Value) -> Result<String, String> {
    let endpoint =
        format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let mut response = reqwest::Client::new()
        .post(endpoint)
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                TIMEOUT_ERROR.to_owned()
            } else {
                GENERATION_ERROR.to_owned()
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(status_error(status));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(RESPONSE_TOO_LARGE_ERROR.to_owned());
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| GENERATION_ERROR.to_owned())?
    {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(RESPONSE_TOO_LARGE_ERROR.to_owned());
        }
        body.extend_from_slice(&chunk);
    }
    let response = serde_json::from_slice(&body).map_err(|_| GENERATION_ERROR.to_owned())?;

    extract_text(response)
}

pub(super) async fn generate_mnemonic(
    api_key: &str,
    model: Option<&str>,
    prompt: &MnemonicPrompt,
) -> Result<String, String> {
    let model = validate_model(model)?;
    send(api_key, model, build_payload(prompt)).await
}

#[cfg(test)]
mod tests {
    use super::{build_payload, extract_text, status_error, validate_model, GeminiResponse};
    use crate::generation::MnemonicPrompt;
    use serde_json::json;

    #[test]
    fn payload_matches_generate_content_contract() {
        let prompt = MnemonicPrompt {
            instructions: "Create one mnemonic.",
            input: "Question: What is active recall?".to_owned(),
            max_output_tokens: 220,
        };
        let payload = build_payload(&prompt);

        assert_eq!(
            payload["systemInstruction"]["parts"][0]["text"],
            prompt.instructions
        );
        assert_eq!(payload["contents"][0]["role"], "user");
        assert_eq!(payload["contents"][0]["parts"][0]["text"], prompt.input);
        assert_eq!(payload["generationConfig"]["maxOutputTokens"], 220);
    }

    #[test]
    fn model_allowlist_and_errors_are_provider_specific() {
        assert_eq!(validate_model(None).unwrap(), "gemini-3.5-flash");
        for model in [
            "gemini-3.5-flash",
            "gemini-3.1-flash-lite",
            "gemini-2.5-pro",
            "gemini-2.5-flash",
        ] {
            assert_eq!(validate_model(Some(model)).unwrap(), model);
        }
        assert!(validate_model(Some("gemini-unlisted")).is_err());
        assert!(status_error(reqwest::StatusCode::UNAUTHORIZED).contains("API key"));
        assert!(status_error(reqwest::StatusCode::NOT_FOUND).contains("model"));
    }

    #[test]
    fn response_returns_text_parts_and_rejects_empty_output() {
        let response: GeminiResponse = serde_json::from_value(json!({
            "candidates": [{ "content": { "parts": [
                { "text": "  First image. " },
                { "text": "Second image." }
            ] } }]
        }))
        .unwrap();
        let empty: GeminiResponse = serde_json::from_value(json!({ "candidates": [] })).unwrap();

        assert_eq!(
            extract_text(response).unwrap(),
            "First image.\nSecond image."
        );
        assert!(extract_text(empty).is_err());
    }
}

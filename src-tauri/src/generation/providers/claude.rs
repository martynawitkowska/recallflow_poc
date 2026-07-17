use super::super::MnemonicPrompt;
use serde::Deserialize;
use std::time::Duration;

const DEFAULT_MODEL: &str = "claude-sonnet-4-6";
const ALLOWED_MODELS: &[&str] = &[DEFAULT_MODEL, "claude-haiku-4-5", "claude-opus-4-8"];
const MESSAGES_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_SECONDS: u64 = 120;
const MAX_RESPONSE_BYTES: usize = 1_000_000;
const GENERATION_ERROR: &str =
    "Claude could not generate a mnemonic. Check your connection and try again.";
const TIMEOUT_ERROR: &str = "Claude took too long to generate a mnemonic. Try again.";
const RESPONSE_TOO_LARGE_ERROR: &str = "Claude returned too much data. Try again.";
const EMPTY_RESPONSE_ERROR: &str = "Claude did not return a mnemonic. Try again.";

#[derive(Deserialize)]
struct ClaudeResponse {
    #[serde(default)]
    content: Vec<ClaudeContent>,
}

#[derive(Deserialize)]
struct ClaudeContent {
    #[serde(rename = "type")]
    content_type: String,
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
                "Choose a supported Claude model: {}.",
                ALLOWED_MODELS.join(", ")
            )
        })
}

fn build_payload(model: &str, prompt: &MnemonicPrompt) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "max_tokens": prompt.max_output_tokens,
        "system": prompt.instructions,
        "messages": [{
            "role": "user",
            "content": prompt.input
        }]
    })
}

fn extract_text(response: ClaudeResponse) -> Result<String, String> {
    let text = response
        .content
        .into_iter()
        .filter(|content| content.content_type == "text")
        .filter_map(|content| content.text)
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
            "Claude rejected the API key. Check it and try again.".to_owned()
        }
        reqwest::StatusCode::TOO_MANY_REQUESTS => {
            "Claude is rate limiting requests. Wait a moment and try again.".to_owned()
        }
        reqwest::StatusCode::BAD_REQUEST | reqwest::StatusCode::NOT_FOUND => {
            "The selected Claude model is unavailable. Try again later.".to_owned()
        }
        reqwest::StatusCode::REQUEST_TIMEOUT => TIMEOUT_ERROR.to_owned(),
        status if status.is_server_error() => {
            "Claude is temporarily unavailable. Wait a moment and try again.".to_owned()
        }
        _ => GENERATION_ERROR.to_owned(),
    }
}

fn parse_response(body: &[u8]) -> Result<ClaudeResponse, String> {
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(RESPONSE_TOO_LARGE_ERROR.to_owned());
    }

    serde_json::from_slice(body).map_err(|_| GENERATION_ERROR.to_owned())
}

async fn send(api_key: &str, payload: serde_json::Value) -> Result<String, String> {
    let mut response = reqwest::Client::new()
        .post(MESSAGES_ENDPOINT)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
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
    let response = parse_response(&body)?;

    extract_text(response)
}

pub(super) async fn generate_mnemonic(
    api_key: &str,
    model: Option<&str>,
    prompt: &MnemonicPrompt,
) -> Result<String, String> {
    let model = validate_model(model)?;
    send(api_key, build_payload(model, prompt)).await
}

#[cfg(test)]
mod tests {
    use super::{
        build_payload, extract_text, parse_response, status_error, validate_model,
        GENERATION_ERROR, MAX_RESPONSE_BYTES, RESPONSE_TOO_LARGE_ERROR,
    };
    use crate::generation::MnemonicPrompt;
    use serde_json::json;

    #[test]
    fn payload_matches_messages_contract() {
        let prompt = MnemonicPrompt {
            instructions: "Create one mnemonic.",
            input: "Question: What is active recall?".to_owned(),
            max_output_tokens: 220,
        };
        let payload = build_payload("claude-sonnet-4-6", &prompt);

        assert_eq!(payload["model"], "claude-sonnet-4-6");
        assert_eq!(payload["max_tokens"], 220);
        assert_eq!(payload["system"], prompt.instructions);
        assert_eq!(payload["messages"][0]["role"], "user");
        assert_eq!(payload["messages"][0]["content"], prompt.input);
    }

    #[test]
    fn model_allowlist_and_errors_are_provider_specific() {
        assert_eq!(validate_model(None).unwrap(), "claude-sonnet-4-6");
        for model in ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-8"] {
            assert_eq!(validate_model(Some(model)).unwrap(), model);
        }
        assert!(validate_model(Some("claude-unlisted")).is_err());
        assert!(status_error(reqwest::StatusCode::UNAUTHORIZED).contains("API key"));
        assert!(status_error(reqwest::StatusCode::NOT_FOUND).contains("model"));
    }

    #[test]
    fn response_returns_text_blocks_and_ignores_other_content() {
        let body = json!({
            "content": [
                { "type": "thinking", "text": "Hidden" },
                { "type": "text", "text": "  Recall it vividly. " }
            ]
        })
        .to_string();
        let empty_body = json!({ "content": [] }).to_string();
        let response = parse_response(body.as_bytes()).unwrap();
        let empty = parse_response(empty_body.as_bytes()).unwrap();

        assert_eq!(extract_text(response).unwrap(), "Recall it vividly.");
        assert!(extract_text(empty).is_err());
    }

    #[test]
    fn response_parser_bounds_untrusted_bodies_and_hides_raw_content() {
        let secret = "sk-ant-REFL71-NEVER-EXPOSE";
        let malformed = parse_response(format!("{{\"secret\":\"{secret}\"").as_bytes())
            .err()
            .expect("malformed JSON should fail safely");
        let oversized = parse_response(&vec![b' '; MAX_RESPONSE_BYTES + 1])
            .err()
            .expect("oversized response should fail safely");

        assert_eq!(malformed, GENERATION_ERROR);
        assert!(!malformed.contains(secret));
        assert_eq!(oversized, RESPONSE_TOO_LARGE_ERROR);
    }

    #[test]
    fn status_failures_cover_auth_rate_limit_timeout_server_and_fallback() {
        for (status, expected) in [
            (reqwest::StatusCode::FORBIDDEN, "API key"),
            (reqwest::StatusCode::TOO_MANY_REQUESTS, "rate limiting"),
            (reqwest::StatusCode::BAD_REQUEST, "model"),
            (reqwest::StatusCode::REQUEST_TIMEOUT, "too long"),
            (reqwest::StatusCode::BAD_GATEWAY, "temporarily unavailable"),
            (reqwest::StatusCode::IM_A_TEAPOT, "could not generate"),
        ] {
            let error = status_error(status);
            assert!(error.contains(expected), "status={status}, error={error:?}");
        }
    }
}

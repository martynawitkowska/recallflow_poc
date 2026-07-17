use super::super::{CandidatePrompt, GenerationPrompt, MnemonicPrompt, VerificationPrompt};
use serde::Deserialize;
use std::time::Duration;

const DEFAULT_MODEL: &str = "gpt-5.4-mini";
const ALLOWED_MODELS: &[&str] = &["gpt-5.5", "gpt-5.4", DEFAULT_MODEL];
const RESPONSES_ENDPOINT: &str = "https://api.openai.com/v1/responses";
const REQUEST_TIMEOUT_SECONDS: u64 = 120;
const MAX_RESPONSE_BYTES: usize = 1_000_000;

#[derive(Clone, Copy)]
struct FailureMessages {
    generation: &'static str,
    timeout: &'static str,
    response_too_large: &'static str,
    incomplete: &'static str,
    refusal: &'static str,
    empty: &'static str,
    bad_request: &'static str,
}

const QUIZ_FAILURES: FailureMessages = FailureMessages {
    generation: "OpenAI could not generate the quiz. Check your connection and try again.",
    timeout: "OpenAI took too long to generate the quiz. Try again with a shorter source.",
    response_too_large: "OpenAI returned too much data. Try again with fewer questions.",
    incomplete: "OpenAI could not complete the quiz. Try again with a shorter or clearer source.",
    refusal: "OpenAI declined to create a quiz from that source. Try different study material.",
    empty: "OpenAI did not return a quiz. Try again with a different source.",
    bad_request: "OpenAI could not process this request. Check the source and try again.",
};

const MNEMONIC_FAILURES: FailureMessages = FailureMessages {
    generation: "OpenAI could not generate a mnemonic. Check your connection and try again.",
    timeout: "OpenAI took too long to generate a mnemonic. Try again.",
    response_too_large: "OpenAI returned a mnemonic that was too large. Try again.",
    incomplete: "OpenAI could not complete the mnemonic. Try again.",
    refusal: "OpenAI declined to create a mnemonic for this question. Try again.",
    empty: "OpenAI did not return a mnemonic. Try again.",
    bad_request: "OpenAI could not process this mnemonic request. Try again.",
};

#[derive(Deserialize)]
struct OpenAiResponse {
    status: String,
    #[serde(default)]
    output: Vec<OpenAiOutputItem>,
}

#[derive(Deserialize)]
struct OpenAiOutputItem {
    #[serde(default)]
    content: Vec<OpenAiContentItem>,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum OpenAiContentItem {
    #[serde(rename = "output_text")]
    OutputText { text: String },
    #[serde(rename = "refusal")]
    Refusal,
    #[serde(other)]
    Other,
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
                "Choose a supported OpenAI model: {}.",
                ALLOWED_MODELS.join(", ")
            )
        })
}

fn build_payload(model: &str, prompt: &GenerationPrompt) -> serde_json::Value {
    let max_output_tokens = (prompt.question_count * 320).max(3_200);
    let mut payload = serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "instructions": prompt.instructions,
        "input": prompt.input,
        "max_output_tokens": max_output_tokens,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "recallflow_quiz",
                "strict": true,
                "schema": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["title", "description", "questions"],
                    "properties": {
                        "title": { "type": "string" },
                        "description": { "type": "string" },
                        "questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["id", "type", "question", "answers", "correctAnswers", "explanation"],
                                "properties": {
                                    "id": { "type": "string" },
                                    "type": { "type": "string", "enum": ["single_choice", "multiple_choice", "true_false"] },
                                    "question": { "type": "string" },
                                    "answers": { "type": "array", "items": { "type": "string" } },
                                    "correctAnswers": { "type": "array", "items": { "type": "string" } },
                                    "explanation": { "type": "string" }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    if prompt.uses_web_search {
        payload["tools"] = serde_json::json!([{ "type": "web_search" }]);
        payload["tool_choice"] = serde_json::json!("required");
    }

    payload
}

fn build_candidate_payload(model: &str, prompt: &CandidatePrompt) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "instructions": prompt.instructions,
        "input": prompt.input,
        "max_output_tokens": 1_600,
        "text": { "format": {
            "type": "json_schema",
            "name": "recallflow_candidate_batch",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["candidates"],
                "properties": { "candidates": {
                    "type": "array",
                    "maxItems": 2,
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["candidate_id", "chunk_id", "topic", "question_type", "question", "answers", "correct_answers", "explanation", "evidence_quote"],
                        "properties": {
                            "candidate_id": { "type": "string" },
                            "chunk_id": { "type": "string" },
                            "topic": { "type": "string" },
                            "question_type": { "type": "string", "enum": ["single_choice", "multiple_choice", "true_false"] },
                            "question": { "type": "string" },
                            "answers": { "type": "array", "items": { "type": "string" } },
                            "correct_answers": { "type": "array", "items": { "type": "string" } },
                            "explanation": { "type": "string" },
                            "evidence_quote": { "type": "string" }
                        }
                    }
                }}
            }
        }}
    })
}

fn build_verification_payload(model: &str, prompt: &VerificationPrompt) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "instructions": prompt.instructions,
        "input": prompt.input,
        "max_output_tokens": 1_600,
        "text": { "format": {
            "type": "json_schema",
            "name": "recallflow_verification_batch",
            "strict": true,
            "schema": {
                "type": "object",
                "additionalProperties": false,
                "required": ["decisions"],
                "properties": { "decisions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": ["candidate_id", "supported", "standalone", "portable", "qualifications_preserved", "not_overgeneralized", "choices_unambiguous", "reason"],
                        "properties": {
                            "candidate_id": { "type": "string" },
                            "supported": { "type": "boolean" },
                            "standalone": { "type": "boolean" },
                            "portable": { "type": "boolean" },
                            "qualifications_preserved": { "type": "boolean" },
                            "not_overgeneralized": { "type": "boolean" },
                            "choices_unambiguous": { "type": "boolean" },
                            "reason": { "type": "string", "enum": ["accepted", "unsupported", "context_dependent", "lecture_bound", "qualification_lost", "overgeneralized", "ambiguous_choices"] }
                        }
                    }
                }}
            }
        }}
    })
}

fn build_mnemonic_payload(model: &str, prompt: &MnemonicPrompt) -> serde_json::Value {
    serde_json::json!({
        "model": model,
        "store": false,
        "reasoning": { "effort": "low" },
        "instructions": prompt.instructions,
        "input": prompt.input,
        "max_output_tokens": prompt.max_output_tokens
    })
}

fn extract_generated_text(
    response: OpenAiResponse,
    failures: FailureMessages,
) -> Result<String, String> {
    if response.status != "completed" {
        return Err(failures.incomplete.to_owned());
    }

    for content in response.output.into_iter().flat_map(|item| item.content) {
        match content {
            OpenAiContentItem::OutputText { text } if !text.trim().is_empty() => return Ok(text),
            OpenAiContentItem::Refusal => return Err(failures.refusal.to_owned()),
            _ => {}
        }
    }

    Err(failures.empty.to_owned())
}

fn status_error(status: reqwest::StatusCode, failures: FailureMessages) -> String {
    match status {
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN => {
            "OpenAI rejected the API key. Check it and try again.".to_owned()
        }
        reqwest::StatusCode::TOO_MANY_REQUESTS => {
            "OpenAI is rate limiting requests. Wait a moment and try again.".to_owned()
        }
        reqwest::StatusCode::BAD_REQUEST => failures.bad_request.to_owned(),
        reqwest::StatusCode::NOT_FOUND => {
            "The selected OpenAI model is unavailable. Choose a supported model and try again."
                .to_owned()
        }
        reqwest::StatusCode::REQUEST_TIMEOUT => failures.timeout.to_owned(),
        status if status.is_server_error() => {
            "OpenAI is temporarily unavailable. Wait a moment and try again.".to_owned()
        }
        _ => failures.generation.to_owned(),
    }
}

fn parse_response(body: &[u8], failures: FailureMessages) -> Result<OpenAiResponse, String> {
    if body.len() > MAX_RESPONSE_BYTES {
        return Err(failures.response_too_large.to_owned());
    }

    serde_json::from_slice(body).map_err(|_| failures.generation.to_owned())
}

async fn send(
    api_key: &str,
    payload: serde_json::Value,
    failures: FailureMessages,
) -> Result<String, String> {
    let mut response = reqwest::Client::new()
        .post(RESPONSES_ENDPOINT)
        .bearer_auth(api_key)
        .json(&payload)
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                failures.timeout.to_owned()
            } else {
                failures.generation.to_owned()
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(status_error(status, failures));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err(failures.response_too_large.to_owned());
    }

    let mut body = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or_default()
            .min(MAX_RESPONSE_BYTES as u64) as usize,
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| failures.generation.to_owned())?
    {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(failures.response_too_large.to_owned());
        }
        body.extend_from_slice(&chunk);
    }
    let response = parse_response(&body, failures)?;

    extract_generated_text(response, failures)
}

pub(super) async fn generate(
    api_key: &str,
    model: Option<&str>,
    prompt: &GenerationPrompt,
) -> Result<String, String> {
    let model = validate_model(model)?;
    send(api_key, build_payload(model, prompt), QUIZ_FAILURES).await
}

pub(super) async fn generate_candidates(
    api_key: &str,
    model: Option<&str>,
    prompt: &CandidatePrompt,
) -> Result<String, String> {
    let model = validate_model(model)?;
    send(
        api_key,
        build_candidate_payload(model, prompt),
        QUIZ_FAILURES,
    )
    .await
}

pub(super) async fn generate_mnemonic(
    api_key: &str,
    model: Option<&str>,
    prompt: &MnemonicPrompt,
) -> Result<String, String> {
    let model = validate_model(model)?;
    send(
        api_key,
        build_mnemonic_payload(model, prompt),
        MNEMONIC_FAILURES,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{
        build_candidate_payload, build_mnemonic_payload, build_payload, build_verification_payload,
        extract_generated_text, parse_response, status_error, validate_model, GenerationPrompt,
        MnemonicPrompt, OpenAiResponse, MAX_RESPONSE_BYTES, MNEMONIC_FAILURES, QUIZ_FAILURES,
    };
    use crate::generation::{CandidatePrompt, GenerationSource, VerificationPrompt};
    use serde_json::json;

    #[test]
    fn payload_uses_web_search_only_for_url_prompts() {
        let url_prompt =
            GenerationPrompt::new(GenerationSource::Url("https://example.com/lecture"), 12);
        let material_prompt = GenerationPrompt::new(GenerationSource::Material("Study notes"), 8);
        let url_payload = build_payload("gpt-5.4-mini", &url_prompt);
        let material_payload = build_payload("gpt-5.4-mini", &material_prompt);

        assert_eq!(material_payload["model"], "gpt-5.4-mini");
        assert_eq!(material_payload["store"], false);
        assert_eq!(material_payload["reasoning"]["effort"], "low");
        assert_eq!(material_payload["max_output_tokens"], 3_200);
        assert_eq!(material_payload["text"]["format"]["type"], "json_schema");
        assert_eq!(material_payload["text"]["format"]["strict"], true);
        assert_eq!(
            material_payload["text"]["format"]["schema"]["additionalProperties"],
            false
        );
        assert_eq!(url_payload["tools"][0]["type"], "web_search");
        assert_eq!(url_payload["tool_choice"], "required");
        assert!(url_payload["input"]
            .as_str()
            .expect("prompt should be text")
            .contains("exactly 12"));
        assert!(material_payload.get("tools").is_none());
    }

    #[test]
    fn grounded_contract_payloads_are_strict_and_not_stored() {
        let candidate = build_candidate_payload(
            "gpt-5.4-mini",
            &CandidatePrompt {
                instructions: "Extract.",
                input: "chunk".to_owned(),
                chunk_id: "chunk-0001".to_owned(),
            },
        );
        let verification = build_verification_payload(
            "gpt-5.4-mini",
            &VerificationPrompt {
                instructions: "Verify.",
                input: "candidate".to_owned(),
            },
        );

        for payload in [&candidate, &verification] {
            assert_eq!(payload["store"], false);
            assert_eq!(payload["text"]["format"]["strict"], true);
            assert_eq!(
                payload["text"]["format"]["schema"]["additionalProperties"],
                false
            );
        }
        assert_eq!(
            candidate["text"]["format"]["schema"]["properties"]["candidates"]["maxItems"],
            2
        );
        assert!(
            verification["text"]["format"]["schema"]["properties"]["decisions"]["items"]
                ["properties"]
                .get("confidence")
                .is_none()
        );
    }

    #[test]
    fn mnemonic_payload_requests_bounded_plain_text() {
        let prompt = MnemonicPrompt {
            instructions: "Create one mnemonic.",
            input: "Question: Where are memories formed?".to_owned(),
            max_output_tokens: 220,
        };
        let payload = build_mnemonic_payload("gpt-5.4-mini", &prompt);

        assert_eq!(payload["model"], "gpt-5.4-mini");
        assert_eq!(payload["store"], false);
        assert_eq!(payload["max_output_tokens"], 220);
        assert!(payload.get("text").is_none());
        assert!(payload.get("tools").is_none());
    }

    #[test]
    fn model_allowlist_accepts_supported_models_and_rejects_unknown_models() {
        assert_eq!(
            validate_model(None).expect("default model should be allowed"),
            "gpt-5.4-mini"
        );
        for model in ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"] {
            assert_eq!(
                validate_model(Some(model)).expect("listed model should be allowed"),
                model
            );
        }
        assert_eq!(
            validate_model(Some(" gpt-5.4-mini ")).unwrap(),
            "gpt-5.4-mini"
        );
        assert!(validate_model(Some("gpt-5.6"))
            .expect_err("unknown model should be rejected")
            .contains("supported OpenAI model"));
    }

    #[test]
    fn provider_failures_are_actionable_and_response_size_is_limited() {
        for (status, expected) in [
            (reqwest::StatusCode::FORBIDDEN, "API key"),
            (reqwest::StatusCode::TOO_MANY_REQUESTS, "rate limiting"),
            (reqwest::StatusCode::BAD_REQUEST, "process this request"),
            (reqwest::StatusCode::NOT_FOUND, "model"),
            (reqwest::StatusCode::REQUEST_TIMEOUT, "too long"),
            (reqwest::StatusCode::BAD_GATEWAY, "temporarily unavailable"),
            (reqwest::StatusCode::IM_A_TEAPOT, "could not generate"),
        ] {
            let error = status_error(status, QUIZ_FAILURES);
            assert!(error.contains(expected), "status={status}, error={error:?}");
        }

        let oversized_body = vec![b' '; MAX_RESPONSE_BYTES + 1];
        assert!(parse_response(&oversized_body, QUIZ_FAILURES)
            .err()
            .expect("oversized response should be rejected")
            .contains("too much data"));
    }

    #[test]
    fn malformed_and_empty_responses_fail_without_exposing_raw_content() {
        let secret = "sk-REFL71-NEVER-EXPOSE";
        let malformed = parse_response(
            format!("{{\"api_key\":\"{secret}\"").as_bytes(),
            QUIZ_FAILURES,
        )
        .err()
        .expect("malformed JSON should fail safely");
        let empty: OpenAiResponse = serde_json::from_value(json!({
            "status": "completed",
            "output": [{
                "content": [
                    { "type": "output_text", "text": "   " },
                    { "type": "unknown", "text": secret }
                ]
            }]
        }))
        .unwrap();

        assert_eq!(malformed, QUIZ_FAILURES.generation);
        assert!(!malformed.contains(secret));
        assert_eq!(
            extract_generated_text(empty, QUIZ_FAILURES).unwrap_err(),
            QUIZ_FAILURES.empty
        );
    }

    #[test]
    fn completed_response_returns_structured_output_text() {
        let body = json!({
            "status": "completed",
            "output": [
                { "type": "web_search_call", "status": "completed" },
                {
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": "{\"title\":\"Generated quiz\",\"questions\":[]}"
                    }]
                }
            ]
        })
        .to_string();
        let response = parse_response(body.as_bytes(), QUIZ_FAILURES)
            .expect("Responses API envelope should deserialize");

        assert_eq!(
            extract_generated_text(response, QUIZ_FAILURES)
                .expect("completed output should be returned"),
            "{\"title\":\"Generated quiz\",\"questions\":[]}"
        );
    }

    #[test]
    fn refusal_and_incomplete_responses_are_actionable() {
        let refusal: OpenAiResponse = serde_json::from_value(json!({
            "status": "completed",
            "output": [{
                "type": "message",
                "content": [{ "type": "refusal", "refusal": "Unable to comply." }]
            }]
        }))
        .expect("refusal should deserialize");
        let incomplete: OpenAiResponse = serde_json::from_value(json!({
            "status": "incomplete",
            "output": []
        }))
        .expect("incomplete response should deserialize");

        assert!(extract_generated_text(refusal, QUIZ_FAILURES)
            .expect_err("refusal should fail")
            .contains("declined"));
        assert!(extract_generated_text(incomplete, QUIZ_FAILURES)
            .expect_err("incomplete response should fail")
            .contains("shorter or clearer source"));
    }

    #[test]
    fn mnemonic_failures_use_mnemonic_specific_messages() {
        let incomplete: OpenAiResponse = serde_json::from_value(json!({
            "status": "incomplete",
            "output": []
        }))
        .unwrap();
        let refusal: OpenAiResponse = serde_json::from_value(json!({
            "status": "completed",
            "output": [{
                "content": [{ "type": "refusal" }]
            }]
        }))
        .unwrap();

        for message in [
            status_error(reqwest::StatusCode::BAD_REQUEST, MNEMONIC_FAILURES),
            status_error(reqwest::StatusCode::REQUEST_TIMEOUT, MNEMONIC_FAILURES),
            parse_response(&vec![b' '; MAX_RESPONSE_BYTES + 1], MNEMONIC_FAILURES)
                .err()
                .expect("oversized mnemonic response should fail"),
            extract_generated_text(incomplete, MNEMONIC_FAILURES).unwrap_err(),
            extract_generated_text(refusal, MNEMONIC_FAILURES).unwrap_err(),
        ] {
            assert!(message.contains("mnemonic"), "message={message:?}");
            assert!(!message.contains("quiz"), "message={message:?}");
        }
    }
}

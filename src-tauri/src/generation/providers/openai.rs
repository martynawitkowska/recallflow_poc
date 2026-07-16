use super::super::GenerationPrompt;
use serde::Deserialize;

const MODEL: &str = "gpt-5.4-mini";
const RESPONSES_ENDPOINT: &str = "https://api.openai.com/v1/responses";
const GENERATION_ERROR: &str =
    "OpenAI could not generate the quiz. Check your connection and try again.";
const INCOMPLETE_RESPONSE_ERROR: &str =
    "OpenAI could not complete the quiz. Try again with a shorter or clearer source.";
const REFUSAL_ERROR: &str =
    "OpenAI declined to create a quiz from that source. Try different study material.";
const EMPTY_RESPONSE_ERROR: &str =
    "OpenAI did not return a quiz. Try again with a different source.";

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

fn build_payload(prompt: &GenerationPrompt) -> serde_json::Value {
    let max_output_tokens = (prompt.question_count * 320).max(3_200);
    let mut payload = serde_json::json!({
        "model": MODEL,
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

fn extract_generated_json(response: OpenAiResponse) -> Result<String, String> {
    if response.status != "completed" {
        return Err(INCOMPLETE_RESPONSE_ERROR.to_owned());
    }

    for content in response.output.into_iter().flat_map(|item| item.content) {
        match content {
            OpenAiContentItem::OutputText { text } if !text.trim().is_empty() => return Ok(text),
            OpenAiContentItem::Refusal => return Err(REFUSAL_ERROR.to_owned()),
            _ => {}
        }
    }

    Err(EMPTY_RESPONSE_ERROR.to_owned())
}

pub(super) async fn generate(api_key: &str, prompt: &GenerationPrompt) -> Result<String, String> {
    let response = reqwest::Client::new()
        .post(RESPONSES_ENDPOINT)
        .bearer_auth(api_key)
        .json(&build_payload(prompt))
        .send()
        .await
        .map_err(|_| GENERATION_ERROR.to_owned())?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Err("OpenAI rejected the API key. Check it and try again.".to_owned());
    }
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("OpenAI is rate limiting requests. Wait a moment and try again.".to_owned());
    }
    if !response.status().is_success() {
        return Err(GENERATION_ERROR.to_owned());
    }

    let response: OpenAiResponse = response
        .json()
        .await
        .map_err(|_| GENERATION_ERROR.to_owned())?;

    extract_generated_json(response)
}

#[cfg(test)]
mod tests {
    use super::{build_payload, extract_generated_json, GenerationPrompt, OpenAiResponse};
    use crate::generation::GenerationSource;
    use serde_json::json;

    #[test]
    fn payload_uses_web_search_only_for_url_prompts() {
        let url_prompt =
            GenerationPrompt::new(GenerationSource::Url("https://example.com/lecture"), 12);
        let material_prompt = GenerationPrompt::new(GenerationSource::Material("Study notes"), 8);
        let url_payload = build_payload(&url_prompt);
        let material_payload = build_payload(&material_prompt);

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
    fn completed_response_returns_structured_output_text() {
        let response: OpenAiResponse = serde_json::from_value(json!({
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
        }))
        .expect("Responses API envelope should deserialize");

        assert_eq!(
            extract_generated_json(response).expect("completed output should be returned"),
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

        assert!(extract_generated_json(refusal)
            .expect_err("refusal should fail")
            .contains("declined"));
        assert!(extract_generated_json(incomplete)
            .expect_err("incomplete response should fail")
            .contains("shorter or clearer source"));
    }
}

use super::super::GenerationPrompt;
use serde::Deserialize;

const MODEL: &str = "gpt-5.4-mini";
const GENERATION_ERROR: &str =
    "OpenAI could not generate the quiz. Check your connection and try again.";

#[derive(Deserialize)]
struct OpenAiResponse {
    #[serde(default)]
    output: Vec<OpenAiOutputItem>,
}

#[derive(Deserialize)]
struct OpenAiOutputItem {
    #[serde(default)]
    content: Vec<OpenAiContentItem>,
}

#[derive(Deserialize)]
struct OpenAiContentItem {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
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

pub(super) async fn generate(api_key: &str, prompt: &GenerationPrompt) -> Result<String, String> {
    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/responses")
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

    response
        .output
        .into_iter()
        .flat_map(|item| item.content)
        .find_map(|content| {
            (content.content_type == "output_text")
                .then_some(content.text)
                .flatten()
        })
        .ok_or_else(|| {
            "OpenAI did not return a quiz. Try again with a different source.".to_owned()
        })
}

#[cfg(test)]
mod tests {
    use super::{build_payload, GenerationPrompt};
    use crate::generation::GenerationSource;

    #[test]
    fn payload_uses_web_search_only_for_url_prompts() {
        let url_prompt =
            GenerationPrompt::new(GenerationSource::Url("https://example.com/lecture"), 12);
        let material_prompt = GenerationPrompt::new(GenerationSource::Material("Study notes"), 8);
        let url_payload = build_payload(&url_prompt);
        let material_payload = build_payload(&material_prompt);

        assert_eq!(url_payload["tools"][0]["type"], "web_search");
        assert_eq!(url_payload["tool_choice"], "required");
        assert!(url_payload["input"]
            .as_str()
            .expect("prompt should be text")
            .contains("exactly 12"));
        assert!(material_payload.get("tools").is_none());
    }
}

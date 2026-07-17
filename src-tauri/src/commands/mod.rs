pub mod app;
pub mod attempts;
pub mod generation;
pub mod library;
pub mod secrets;

pub(crate) fn redact_secret_error(error: String, secret: &str, fallback: &str) -> String {
    let trimmed_secret = secret.trim();
    let exposes_secret = (!secret.is_empty() && error.contains(secret))
        || (!trimmed_secret.is_empty() && error.contains(trimmed_secret));

    if exposes_secret {
        fallback.to_owned()
    } else {
        error
    }
}

#[cfg(test)]
mod tests {
    use super::redact_secret_error;

    #[test]
    fn credential_errors_use_a_safe_fallback() {
        let api_key = "sk-REFL67-NEVER-EXPOSE-1234567890";
        let fallback = "The provider request failed safely.";
        let error = redact_secret_error(
            format!("Provider rejected credential {api_key}"),
            api_key,
            fallback,
        );

        assert_eq!(error, fallback);
        assert!(!error.contains(api_key));
    }

    #[test]
    fn secret_free_errors_remain_actionable() {
        let error = "OpenAI rejected the API key.".to_owned();

        assert_eq!(
            redact_secret_error(error.clone(), "sk-safe-test-key-1234567890", "fallback"),
            error
        );
    }

    #[test]
    fn normalized_credentials_are_redacted_without_matching_empty_secrets() {
        let api_key = "sk-REFL69-NEVER-EXPOSE-1234567890";
        let fallback = "The provider request failed safely.";

        assert_eq!(
            redact_secret_error(
                format!("Provider rejected credential {api_key}"),
                &format!("  {api_key}  "),
                fallback,
            ),
            fallback
        );
        assert_eq!(
            redact_secret_error("Actionable error".to_owned(), "", fallback),
            "Actionable error"
        );
    }
}

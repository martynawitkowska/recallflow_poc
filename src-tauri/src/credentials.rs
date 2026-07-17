use crate::models::{AiProvider, ApiKeyStatus};
use keyring::v1::{Entry, Error};
use zeroize::Zeroizing;

const SERVICE: &str = "com.martynawitkowska.recallflow.api-keys";
const INVALID_PROVIDER_ERROR: &str = "Choose a supported AI provider.";
const INVALID_API_KEY_ERROR: &str = "Enter a valid API key without spaces.";
const KEYCHAIN_UNAVAILABLE_ERROR: &str =
    "The operating system credential store is locked or unavailable. Unlock it and try again.";
const KEYCHAIN_READ_ERROR: &str =
    "RecallFlow could not read the saved API key. Remove it and add it again.";
const KEYCHAIN_SAVE_ERROR: &str =
    "RecallFlow could not save the API key in the operating system credential store.";
const KEYCHAIN_DELETE_ERROR: &str =
    "RecallFlow could not remove the API key from the operating system credential store.";

fn provider_account(provider: AiProvider) -> Result<&'static str, String> {
    match provider {
        AiProvider::Openai => Ok("openai"),
        AiProvider::Gemini => Ok("gemini"),
        AiProvider::Claude => Ok("claude"),
        AiProvider::Unsupported => Err(INVALID_PROVIDER_ERROR.to_owned()),
    }
}

fn provider_label(provider: AiProvider) -> Result<&'static str, String> {
    match provider {
        AiProvider::Openai => Ok("OpenAI"),
        AiProvider::Gemini => Ok("Google Gemini"),
        AiProvider::Claude => Ok("Anthropic Claude"),
        AiProvider::Unsupported => Err(INVALID_PROVIDER_ERROR.to_owned()),
    }
}

fn provider_entry(provider: AiProvider) -> Result<Entry, String> {
    Entry::new(SERVICE, provider_account(provider)?).map_err(|error| map_store_error(&error))
}

fn map_store_error(error: &Error) -> String {
    match error {
        Error::NoStorageAccess(_) | Error::NoDefaultStore | Error::PlatformFailure(_) => {
            KEYCHAIN_UNAVAILABLE_ERROR.to_owned()
        }
        _ => KEYCHAIN_READ_ERROR.to_owned(),
    }
}

fn missing_key_error(provider: AiProvider) -> String {
    provider_label(provider)
        .map(|label| format!("Save your {label} API key in Settings before generating."))
        .unwrap_or_else(|error| error)
}

fn mask_api_key(api_key: &str) -> String {
    let suffix = api_key.chars().rev().take(4).collect::<Vec<_>>();
    format!("••••••••{}", suffix.into_iter().rev().collect::<String>())
}

fn normalize_api_key(api_key: String) -> Result<Zeroizing<String>, String> {
    let api_key = Zeroizing::new(api_key);
    let normalized = Zeroizing::new(api_key.trim().to_owned());
    if normalized.len() < 20 || normalized.chars().any(char::is_whitespace) {
        return Err(INVALID_API_KEY_ERROR.to_owned());
    }
    Ok(normalized)
}

async fn run_blocking<T>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| KEYCHAIN_UNAVAILABLE_ERROR.to_owned())?
}

pub async fn get_api_key(provider: AiProvider) -> Result<Zeroizing<String>, String> {
    run_blocking(move || {
        let entry = provider_entry(provider)?;
        entry
            .get_password()
            .map(Zeroizing::new)
            .map_err(|error| match error {
                Error::NoEntry => missing_key_error(provider),
                _ => map_store_error(&error),
            })
    })
    .await
}

pub async fn get_api_key_status(provider: AiProvider) -> Result<ApiKeyStatus, String> {
    run_blocking(move || {
        let entry = provider_entry(provider)?;
        match entry.get_password() {
            Ok(api_key) => {
                let api_key = Zeroizing::new(api_key);
                Ok(ApiKeyStatus {
                    configured: true,
                    masked_key: Some(mask_api_key(&api_key)),
                })
            }
            Err(Error::NoEntry) => Ok(ApiKeyStatus {
                configured: false,
                masked_key: None,
            }),
            Err(error) => Err(map_store_error(&error)),
        }
    })
    .await
}

pub async fn save_api_key(provider: AiProvider, api_key: String) -> Result<ApiKeyStatus, String> {
    let api_key = normalize_api_key(api_key)?;
    run_blocking(move || {
        let entry = provider_entry(provider)?;
        entry.set_password(&api_key).map_err(|error| match error {
            Error::NoStorageAccess(_) | Error::NoDefaultStore | Error::PlatformFailure(_) => {
                KEYCHAIN_UNAVAILABLE_ERROR.to_owned()
            }
            _ => KEYCHAIN_SAVE_ERROR.to_owned(),
        })?;
        Ok(ApiKeyStatus {
            configured: true,
            masked_key: Some(mask_api_key(&api_key)),
        })
    })
    .await
}

pub async fn delete_api_key(provider: AiProvider) -> Result<ApiKeyStatus, String> {
    run_blocking(move || {
        let entry = provider_entry(provider)?;
        match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(ApiKeyStatus {
                configured: false,
                masked_key: None,
            }),
            Err(error) => Err(match error {
                Error::NoStorageAccess(_) | Error::NoDefaultStore | Error::PlatformFailure(_) => {
                    KEYCHAIN_UNAVAILABLE_ERROR.to_owned()
                }
                _ => KEYCHAIN_DELETE_ERROR.to_owned(),
            }),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_accounts_are_stable_and_separate() {
        assert_eq!(SERVICE, "com.martynawitkowska.recallflow.api-keys");
        assert_eq!(provider_account(AiProvider::Openai).unwrap(), "openai");
        assert_eq!(provider_account(AiProvider::Gemini).unwrap(), "gemini");
        assert_eq!(provider_account(AiProvider::Claude).unwrap(), "claude");
        assert!(provider_account(AiProvider::Unsupported).is_err());
    }

    #[test]
    fn api_keys_enforce_length_whitespace_and_masking() {
        let key = normalize_api_key("  provider-api-key-1234  ".to_owned()).unwrap();
        assert_eq!(&*key, "provider-api-key-1234");
        assert_eq!(mask_api_key(&key), "••••••••1234");
        assert!(normalize_api_key("12345678901234567890".to_owned()).is_ok());
        for invalid in ["1234567890123456789", "provider api key with spaces"] {
            assert_eq!(
                normalize_api_key(invalid.to_owned()).err().as_deref(),
                Some(INVALID_API_KEY_ERROR),
                "input={invalid:?}"
            );
        }
    }

    #[test]
    fn missing_and_unavailable_credentials_have_distinct_messages() {
        assert!(missing_key_error(AiProvider::Openai).contains("Save your OpenAI"));
        assert_eq!(
            map_store_error(&Error::NoDefaultStore),
            KEYCHAIN_UNAVAILABLE_ERROR
        );
        assert_ne!(
            missing_key_error(AiProvider::Openai),
            KEYCHAIN_UNAVAILABLE_ERROR
        );
    }
}

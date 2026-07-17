use crate::models::{AiProvider, ApiKeyStatus, AppInfo};
use sqlx::SqlitePool;
use std::sync::RwLock;

const SECRET_STATE_ERROR: &str =
    "RecallFlow could not access API keys for this session. Restart the app and try again.";
const INVALID_PROVIDER_ERROR: &str = "Choose a supported AI provider.";
const INVALID_API_KEY_ERROR: &str = "Enter a valid API key without spaces.";

#[derive(Debug)]
pub struct AppState {
    app_info: AppInfo,
}

#[derive(Debug)]
pub struct DatabaseState {
    pool: SqlitePool,
}

pub struct SecretState {
    api_keys: RwLock<ApiKeys>,
}

#[derive(Default)]
struct ApiKeys {
    openai: Option<String>,
    gemini: Option<String>,
    claude: Option<String>,
}

impl ApiKeys {
    fn get(&self, provider: AiProvider) -> Result<Option<&str>, String> {
        match provider {
            AiProvider::Openai => Ok(self.openai.as_deref()),
            AiProvider::Gemini => Ok(self.gemini.as_deref()),
            AiProvider::Claude => Ok(self.claude.as_deref()),
            AiProvider::Unsupported => Err(INVALID_PROVIDER_ERROR.to_owned()),
        }
    }

    fn set(&mut self, provider: AiProvider, api_key: Option<String>) -> Result<(), String> {
        match provider {
            AiProvider::Openai => self.openai = api_key,
            AiProvider::Gemini => self.gemini = api_key,
            AiProvider::Claude => self.claude = api_key,
            AiProvider::Unsupported => return Err(INVALID_PROVIDER_ERROR.to_owned()),
        }
        Ok(())
    }
}

impl Default for SecretState {
    fn default() -> Self {
        Self {
            api_keys: RwLock::new(ApiKeys::default()),
        }
    }
}

impl SecretState {
    pub fn status(&self, provider: AiProvider) -> Result<ApiKeyStatus, String> {
        let api_keys = self
            .api_keys
            .read()
            .map_err(|_| SECRET_STATE_ERROR.to_owned())?;
        Ok(match api_keys.get(provider)? {
            Some(api_key) => ApiKeyStatus {
                configured: true,
                masked_key: Some(mask_api_key(api_key)),
            },
            None => ApiKeyStatus {
                configured: false,
                masked_key: None,
            },
        })
    }

    pub fn save(&self, provider: AiProvider, api_key: String) -> Result<ApiKeyStatus, String> {
        let api_key = api_key.trim();
        if api_key.len() < 20 || api_key.chars().any(char::is_whitespace) {
            return Err(INVALID_API_KEY_ERROR.to_owned());
        }

        self.api_keys
            .write()
            .map_err(|_| SECRET_STATE_ERROR.to_owned())?
            .set(provider, Some(api_key.to_owned()))?;
        self.status(provider)
    }

    pub fn remove(&self, provider: AiProvider) -> Result<ApiKeyStatus, String> {
        self.api_keys
            .write()
            .map_err(|_| SECRET_STATE_ERROR.to_owned())?
            .set(provider, None)?;
        self.status(provider)
    }

    pub fn clear(&self) -> Result<(), String> {
        *self
            .api_keys
            .write()
            .map_err(|_| SECRET_STATE_ERROR.to_owned())? = ApiKeys::default();
        Ok(())
    }
}

fn mask_api_key(api_key: &str) -> String {
    let suffix = api_key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    format!("••••••••{suffix}")
}

impl DatabaseState {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

impl AppState {
    pub fn new(app_info: AppInfo) -> Self {
        Self { app_info }
    }

    pub fn app_info(&self) -> AppInfo {
        self.app_info.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_provider_keys_independently_and_removes_only_the_selected_key() {
        let state = SecretState::default();

        assert_eq!(
            state
                .save(AiProvider::Openai, "  openai-session-key-1234  ".to_owned())
                .unwrap(),
            ApiKeyStatus {
                configured: true,
                masked_key: Some("••••••••1234".to_owned()),
            }
        );
        state
            .save(AiProvider::Gemini, "gemini-session-key-5678".to_owned())
            .unwrap();

        assert_eq!(
            state.remove(AiProvider::Openai).unwrap(),
            ApiKeyStatus {
                configured: false,
                masked_key: None,
            }
        );
        assert!(state.status(AiProvider::Gemini).unwrap().configured);
    }

    #[test]
    fn new_state_is_empty_and_rejects_invalid_keys_and_providers() {
        let state = SecretState::default();

        for provider in [AiProvider::Openai, AiProvider::Gemini, AiProvider::Claude] {
            assert_eq!(
                state.status(provider).unwrap(),
                ApiKeyStatus {
                    configured: false,
                    masked_key: None,
                }
            );
        }

        assert_eq!(
            state
                .save(AiProvider::Claude, "invalid key with spaces".to_owned())
                .unwrap_err(),
            INVALID_API_KEY_ERROR
        );
        assert_eq!(
            state.status(AiProvider::Unsupported).unwrap_err(),
            INVALID_PROVIDER_ERROR
        );
    }

    #[test]
    fn clear_removes_every_provider_key() {
        let state = SecretState::default();
        for provider in [AiProvider::Openai, AiProvider::Gemini, AiProvider::Claude] {
            state
                .save(provider, "provider-session-key-1234".to_owned())
                .unwrap();
        }

        state.clear().unwrap();

        for provider in [AiProvider::Openai, AiProvider::Gemini, AiProvider::Claude] {
            assert!(!state.status(provider).unwrap().configured);
        }
    }

    #[test]
    fn api_key_validation_enforces_the_minimum_length_boundary() {
        let state = SecretState::default();

        assert_eq!(
            state
                .save(AiProvider::Openai, "1234567890123456789".to_owned())
                .unwrap_err(),
            INVALID_API_KEY_ERROR
        );
        assert_eq!(
            state
                .save(AiProvider::Openai, "12345678901234567890".to_owned())
                .unwrap(),
            ApiKeyStatus {
                configured: true,
                masked_key: Some("••••••••7890".to_owned()),
            }
        );
    }
}

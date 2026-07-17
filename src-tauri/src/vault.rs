use rand_core::{OsRng, TryRngCore};
use std::path::Path;
use tauri::{plugin::TauriPlugin, Runtime};

pub const CURRENT_VAULT_FILE: &str = "recallflow-secrets-v1.hold";
pub const LEGACY_VAULT_FILE: &str = "recallflow-secrets.hold";
const CURRENT_SALT_FILE: &str = "stronghold-salt-v1.txt";
const LEGACY_SALT_FILE: &str = "stronghold-salt.txt";
const LEGACY_PASSWORD_PREFIX: &str = "recallflow-legacy:";
const SALT_LENGTH: usize = 32;

pub fn plugin<R: Runtime>(app_data_dir: &Path) -> TauriPlugin<R> {
    let current_salt = app_data_dir.join(CURRENT_SALT_FILE);
    let legacy_salt = app_data_dir.join(LEGACY_SALT_FILE);
    tauri_plugin_stronghold::Builder::new(move |password| {
        derive_key(password, &current_salt, &legacy_salt)
    })
    .build()
}

pub fn remove_file_if_exists(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn derive_key(password: &str, current_salt: &Path, legacy_salt: &Path) -> Vec<u8> {
    let (password, salt_path) = match password.strip_prefix(LEGACY_PASSWORD_PREFIX) {
        Some(password) => (password, legacy_salt),
        None => (password, current_salt),
    };
    let salt = read_or_create_salt(salt_path);
    argon2::hash_raw(password.as_bytes(), &salt, &Default::default())
        .expect("failed to derive Stronghold key")
}

fn read_or_create_salt(path: &Path) -> [u8; SALT_LENGTH] {
    if path.is_file() {
        return std::fs::read(path)
            .expect("failed to read Stronghold salt")
            .try_into()
            .expect("Stronghold salt must be 32 bytes");
    }

    let mut salt = [0; SALT_LENGTH];
    OsRng
        .try_fill_bytes(&mut salt)
        .expect("failed to generate Stronghold salt");
    std::fs::write(path, salt).expect("failed to save Stronghold salt");
    salt
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static TEST_DIRECTORY_ID: AtomicUsize = AtomicUsize::new(0);

    fn test_directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "recallflow-vault-test-{}-{}",
            std::process::id(),
            TEST_DIRECTORY_ID.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn legacy_prefix_selects_old_salt_without_changing_the_password() {
        let directory = test_directory();
        let current_salt = directory.join(CURRENT_SALT_FILE);
        let legacy_salt = directory.join(LEGACY_SALT_FILE);
        std::fs::write(&current_salt, [1; SALT_LENGTH]).unwrap();
        std::fs::write(&legacy_salt, [2; SALT_LENGTH]).unwrap();

        assert_eq!(
            derive_key(
                "recallflow-legacy:previous-password",
                &current_salt,
                &legacy_salt,
            ),
            argon2::hash_raw(b"previous-password", &[2; SALT_LENGTH], &Default::default(),)
                .unwrap()
        );
        assert_ne!(
            derive_key("previous-password", &current_salt, &legacy_salt),
            derive_key(
                "recallflow-legacy:previous-password",
                &current_salt,
                &legacy_salt,
            )
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn salt_creation_and_file_removal_are_repeatable() {
        let directory = test_directory();
        let salt_path = directory.join(CURRENT_SALT_FILE);
        assert_eq!(
            read_or_create_salt(&salt_path),
            read_or_create_salt(&salt_path)
        );

        let vault_path = directory.join(CURRENT_VAULT_FILE);
        std::fs::write(&vault_path, b"vault").unwrap();
        remove_file_if_exists(&vault_path).unwrap();
        remove_file_if_exists(&vault_path).unwrap();
        std::fs::remove_dir_all(directory).unwrap();
    }
}

use crate::{generation::CancellationFlag, models::AppInfo};
use sqlx::SqlitePool;
use std::{collections::HashMap, sync::Mutex};

#[derive(Debug)]
pub struct AppState {
    app_info: AppInfo,
}

#[derive(Debug)]
pub struct DatabaseState {
    pool: SqlitePool,
}

#[derive(Debug, Default)]
pub struct GenerationRuns {
    runs: Mutex<HashMap<String, CancellationFlag>>,
}

impl GenerationRuns {
    pub(crate) fn begin(&self, run_id: &str) -> Result<CancellationFlag, String> {
        if run_id.trim().is_empty() || run_id.chars().count() > 128 {
            return Err("RecallFlow could not start an invalid generation run.".to_owned());
        }
        let mut runs = self.runs.lock().map_err(|_| {
            "RecallFlow could not start generation. Restart the app and try again.".to_owned()
        })?;
        if runs.contains_key(run_id) {
            return Err("This generation run is already active.".to_owned());
        }
        let cancellation = CancellationFlag::default();
        runs.insert(run_id.to_owned(), cancellation.clone());
        Ok(cancellation)
    }

    pub(crate) fn cancel(&self, run_id: &str) {
        if let Ok(runs) = self.runs.lock() {
            if let Some(cancellation) = runs.get(run_id) {
                cancellation.cancel();
            }
        }
    }

    pub(crate) fn finish(&self, run_id: &str) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.remove(run_id);
        }
    }
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
    use super::GenerationRuns;

    #[test]
    fn generation_runs_reject_duplicates_and_cancel_without_retaining_content() {
        let runs = GenerationRuns::default();
        let flag = runs.begin("run-1").unwrap();
        assert!(runs.begin("run-1").is_err());
        runs.cancel("run-1");
        assert!(flag.is_cancelled());
        runs.finish("run-1");
        assert!(runs.begin("run-1").is_ok());
    }
}

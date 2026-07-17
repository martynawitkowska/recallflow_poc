use crate::models::AppInfo;
use sqlx::SqlitePool;

#[derive(Debug)]
pub struct AppState {
    app_info: AppInfo,
}

#[derive(Debug)]
pub struct DatabaseState {
    pool: SqlitePool,
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

use crate::models::AppInfo;

#[derive(Debug)]
pub struct AppState {
    app_info: AppInfo,
}

impl AppState {
    pub fn new(app_info: AppInfo) -> Self {
        Self { app_info }
    }

    pub fn app_info(&self) -> AppInfo {
        self.app_info.clone()
    }
}

use recallflow_lib::{models::AppInfo, state::AppState};
use serde_json::json;

#[test]
fn app_info_serializes_to_the_frontend_contract() {
    let app_info = AppInfo::new("RecallFlow", "0.1.0");

    assert_eq!(
        serde_json::to_value(app_info).expect("app info should serialize"),
        json!({ "name": "RecallFlow", "version": "0.1.0" })
    );
}

#[test]
fn app_state_returns_its_configured_app_info() {
    let expected = AppInfo::new("RecallFlow", "0.1.0");
    let state = AppState::new(expected.clone());

    assert_eq!(state.app_info(), expected);
}

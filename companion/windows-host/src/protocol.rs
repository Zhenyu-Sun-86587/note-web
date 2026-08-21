use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NativeAction {
    Ping,
    GetState,
    SwitchAscii,
    Restore,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeRequest {
    pub id: String,
    pub action: NativeAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SwitchStrategy {
    ImeOpenState,
    KeyboardLayout,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NativeResponse {
    pub id: String,
    pub ok: bool,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<SwitchStrategy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified: Option<bool>,
    #[serde(rename = "targetPid", skip_serializing_if = "Option::is_none")]
    pub target_pid: Option<u32>,
    #[serde(rename = "targetHwnd", skip_serializing_if = "Option::is_none")]
    pub target_hwnd: Option<String>,
    #[serde(rename = "elapsedMs", skip_serializing_if = "Option::is_none")]
    pub elapsed_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restored: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub released: Option<bool>,
}

impl NativeResponse {
    pub fn success(id: &str, action: &str) -> Self {
        Self {
            id: id.to_string(),
            ok: true,
            action: action.to_string(),
            strategy: None,
            verified: None,
            target_pid: None,
            target_hwnd: None,
            elapsed_ms: None,
            message: None,
            code: None,
            restored: None,
            released: None,
        }
    }

    pub fn error(id: &str, action: &str, code: &str, message: &str) -> Self {
        Self {
            id: id.to_string(),
            ok: false,
            action: action.to_string(),
            strategy: None,
            verified: None,
            target_pid: None,
            target_hwnd: None,
            elapsed_ms: None,
            message: Some(message.to_string()),
            code: Some(code.to_string()),
            restored: None,
            released: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_requests() {
        let ping_json = r#"{"id":"req-1","action":"ping"}"#;
        let req: NativeRequest = serde_json::from_str(ping_json).expect("valid json");
        assert_eq!(req.id, "req-1");
        assert_eq!(req.action, NativeAction::Ping);

        let switch_json = r#"{"id":"req-2","action":"switch_ascii"}"#;
        let req2: NativeRequest = serde_json::from_str(switch_json).expect("valid json");
        assert_eq!(req2.id, "req-2");
        assert_eq!(req2.action, NativeAction::SwitchAscii);

        let restore_json = r#"{"id":"req-3","action":"restore"}"#;
        let req3: NativeRequest = serde_json::from_str(restore_json).expect("valid json");
        assert_eq!(req3.id, "req-3");
        assert_eq!(req3.action, NativeAction::Restore);
    }

    #[test]
    fn test_serialize_responses() {
        let mut resp = NativeResponse::success("req-1", "switch_ascii");
        resp.strategy = Some(SwitchStrategy::KeyboardLayout);
        resp.verified = Some(true);
        resp.target_pid = Some(1234);
        resp.target_hwnd = Some("0x1234".to_string());
        resp.elapsed_ms = Some(15);
        resp.released = Some(true);

        let json = serde_json::to_string(&resp).expect("serialize success");
        assert!(json.contains(r#""strategy":"keyboard_layout""#));
        assert!(json.contains(r#""targetPid":1234"#));
        assert!(json.contains(r#""verified":true"#));
        assert!(json.contains(r#""released":true"#));

        let err_resp = NativeResponse::error(
            "req-2",
            "switch_ascii",
            "TARGET_NOT_BROWSER",
            "Target window is not browser",
        );
        let err_json = serde_json::to_string(&err_resp).expect("serialize error");
        assert!(err_json.contains(r#""ok":false"#));
        assert!(err_json.contains(r#""code":"TARGET_NOT_BROWSER""#));
    }
}

use std::io::{ErrorKind, Read, Write};

use anyhow::{bail, Context, Result};

use crate::protocol::{NativeRequest, NativeResponse};

const MAX_MESSAGE_SIZE: usize = 1024 * 1024; // 1 MB

pub fn read_message<R: Read>(reader: &mut R) -> Result<Option<NativeRequest>> {
    let mut len_bytes = [0u8; 4];
    match reader.read_exact(&mut len_bytes) {
        Ok(()) => {}
        Err(e) if e.kind() == ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }

    let len = u32::from_ne_bytes(len_bytes) as usize;
    if len == 0 {
        bail!("Invalid empty message length");
    }
    if len > MAX_MESSAGE_SIZE {
        bail!(
            "Message size {} exceeds maximum allowed limit of {}",
            len,
            MAX_MESSAGE_SIZE
        );
    }

    let mut buf = vec![0u8; len];
    reader
        .read_exact(&mut buf)
        .context("Failed to read full message payload")?;

    let req = serde_json::from_slice::<NativeRequest>(&buf)
        .context("Failed to parse NativeRequest JSON payload")?;
    Ok(Some(req))
}

pub fn write_message<W: Write>(writer: &mut W, response: &NativeResponse) -> Result<()> {
    let json_bytes = serde_json::to_vec(response).context("Failed to serialize response")?;
    let len = json_bytes.len() as u32;
    let len_bytes = len.to_ne_bytes();

    writer
        .write_all(&len_bytes)
        .context("Failed to write length header")?;
    writer
        .write_all(&json_bytes)
        .context("Failed to write payload")?;
    writer.flush().context("Failed to flush response stream")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{NativeAction, SwitchStrategy};
    use std::io::Cursor;

    #[test]
    fn test_read_valid_message() {
        let json = r#"{"id":"test-1","action":"ping"}"#;
        let mut data = Vec::new();
        let len = (json.len() as u32).to_ne_bytes();
        data.extend_from_slice(&len);
        data.extend_from_slice(json.as_bytes());

        let mut cursor = Cursor::new(data);
        let msg = read_message(&mut cursor)
            .expect("read ok")
            .expect("some msg");
        assert_eq!(msg.id, "test-1");
        assert_eq!(msg.action, NativeAction::Ping);
    }

    #[test]
    fn test_read_clean_eof() {
        let mut cursor = Cursor::new(Vec::<u8>::new());
        let msg = read_message(&mut cursor).expect("read ok");
        assert!(msg.is_none());
    }

    #[test]
    fn test_read_truncated_header() {
        let data = vec![1, 2];
        let mut cursor = Cursor::new(data);
        let res = read_message(&mut cursor);
        assert!(res.is_ok());
        assert!(res.unwrap().is_none());
    }

    #[test]
    fn test_read_truncated_payload() {
        let mut data = Vec::new();
        let len = 100u32.to_ne_bytes();
        data.extend_from_slice(&len);
        data.extend_from_slice(b"partial payload");

        let mut cursor = Cursor::new(data);
        let res = read_message(&mut cursor);
        assert!(res.is_err());
    }

    #[test]
    fn test_read_invalid_json() {
        let invalid_json = b"not a json";
        let mut data = Vec::new();
        let len = (invalid_json.len() as u32).to_ne_bytes();
        data.extend_from_slice(&len);
        data.extend_from_slice(invalid_json);

        let mut cursor = Cursor::new(data);
        let res = read_message(&mut cursor);
        assert!(res.is_err());
    }

    #[test]
    fn test_write_and_read_roundtrip() {
        let mut resp = NativeResponse::success("resp-1", "switch_ascii");
        resp.strategy = Some(SwitchStrategy::KeyboardLayout);
        resp.verified = Some(true);
        resp.target_pid = Some(5432);

        let mut out = Vec::new();
        write_message(&mut out, &resp).expect("write ok");

        let len_bytes: [u8; 4] = out[0..4].try_into().unwrap();
        let len = u32::from_ne_bytes(len_bytes) as usize;
        assert_eq!(len, out.len() - 4);

        let parsed: NativeResponse = serde_json::from_slice(&out[4..]).expect("parse written json");
        assert_eq!(parsed.id, "resp-1");
        assert_eq!(parsed.strategy, Some(SwitchStrategy::KeyboardLayout));
        assert_eq!(parsed.target_pid, Some(5432));
    }
}

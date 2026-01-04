use sha2::{Digest, Sha256};
use tauri::command;

#[command]
pub fn get_machine_id() -> Result<String, String> {
    let id = machine_uid::get().map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(id.as_bytes());
    let result = hasher.finalize();
    Ok(hex::encode(result))
}

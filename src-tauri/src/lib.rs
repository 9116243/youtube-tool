use std::fs::File;
use std::io::Write;
use std::process::Command;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn export_video(clips: Vec<String>, output_path: String) -> Result<(), String> {
    if clips.is_empty() {
        return Err("No clips provided for export.".to_string());
    }

    let mut inputs_path = std::env::temp_dir();
    inputs_path.push("youtube_tool_inputs.txt");

    let mut inputs_file = File::create(&inputs_path).map_err(|e| e.to_string())?;
    for clip in &clips {
        let sanitized = clip.replace('\'', "'\\''");
        writeln!(inputs_file, "file '{}'", sanitized).map_err(|e| e.to_string())?;
    }
    drop(inputs_file);

    let status = Command::new("ffmpeg")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&inputs_path)
        .arg("-c")
        .arg("copy")
        .arg(&output_path)
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "ffmpeg exited with status code: {:?}",
            status.code()
        ))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, export_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

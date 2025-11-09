#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const APP_FOLDER: &str = "youtube-helper-ai";
const DNA_DB_FILE: &str = "dna-db.json";
const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RiskReport {
  risk_level: String,
  video_title: String,
  content_id_risk: String,
  guideline_risk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChannelData {
  id: String,
  avatar: String,
  channel_name: String,
  potential: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FrameDna {
  path: String,
  hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct SettingsData {
  gemini_keys: String,
  open_ai_keys: String,
  fish_audio_key: String,
  eleven_labs_key: String,
  http_proxy: String,
}

impl Default for SettingsData {
  fn default() -> Self {
    Self {
      gemini_keys: String::new(),
      open_ai_keys: String::new(),
      fish_audio_key: String::new(),
      eleven_labs_key: String::new(),
      http_proxy: "http://127.0.0.1:7890".into(),
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GeneratedKey { key: String }

// ------------------ 路径辅助 ------------------
fn app_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_config_dir()
    .ok_or_else(|| "app_config_dir unavailable".to_string())?
    .join(APP_FOLDER);
  fs::create_dir_all(&base).map_err(|e| e.to_string())?;
  Ok(base)
}

fn dna_db_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_storage_dir(app)?.join(DNA_DB_FILE))
}

// ------------------ 命令实现 ------------------
#[tauri::command]
async fn analyze_url(url: String) -> Result<String, String> {
  let payload = json!({
    "url": url,
    "formats": [{
      "id": "best",
      "ext": "mp4",
      "resolution": "1080p",
      "fps": 30,
      "filesize": 125_000_000,
      "format_note": "Placeholder format"
    }]
  });
  Ok(payload.to_string())
}

#[tauri::command]
async fn download_video(url: String, format_id: String, out_dir: String) -> Result<(), String> {
  println!("download_video invoked: url={url}, format_id={format_id}, out_dir={out_dir}");
  Ok(())
}

#[tauri::command]
async fn analyze_niche(keyword: String) -> Result<Vec<ChannelData>, String> {
  Ok(vec![ChannelData {
    id: format!("demo-{keyword}"),
    avatar: String::new(),
    channel_name: format!("{keyword} Channel"),
    potential: 0.76,
  }])
}

#[tauri::command]
async fn analyze_risk(url: String) -> Result<RiskReport, String> {
  Ok(RiskReport {
    risk_level: "Low".into(),
    video_title: format!("Analysis for {url}"),
    content_id_risk: "No matches found".into(),
    guideline_risk: "No violations detected".into(),
  })
}

#[tauri::command]
async fn extract_frames(app: AppHandle, input: String, fps: f64) -> Result<String, String> {
  let app_dir = app
    .path()
    .app_data_dir()
    .ok_or_else(|| "app_data_dir unavailable".to_string())?;
  fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

  let out_dir = app_dir
    .join("compliance_samples")
    .join(Utc::now().timestamp().to_string());
  fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

  let ffmpeg = app
    .path()
    .resource_dir()
    .ok_or_else(|| "resource_dir unavailable".to_string())?
    .join("binaries")
    .join(if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" });

  if !ffmpeg.exists() {
    return Err("ffmpeg not found in src-tauri/binaries".into());
  }

  let mut cmd = std::process::Command::new(ffmpeg);
  cmd.arg("-y")
    .arg("-i").arg(&input)
    .arg("-vf").arg(format!("fps={},scale=320:-1", fps))
    .arg(out_dir.join("frame_%05d.jpg").to_string_lossy().to_string());

  let status = cmd.status().map_err(|e| e.to_string())?;
  if !status.success() {
    return Err(format!("ffmpeg exited with status {status:?}"));
  }
  Ok(out_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn list_directory(target: String, exts: Option<Vec<String>>) -> Result<Vec<String>, String> {
  tauri::async_runtime::spawn_blocking(move || -> Result<Vec<String>, String> {
    let path = PathBuf::from(&target);
    if !path.exists() {
      return Ok(Vec::new());
    }

    let filters = exts.map(|v| v.into_iter().map(|e| e.to_lowercase()).collect::<Vec<_>>());
    let mut entries = Vec::new();

    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
      let entry = entry.map_err(|e| e.to_string())?;
      let p = entry.path();
      if p.is_file() {
        if let Some(ref allowed) = filters {
          if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            if allowed.contains(&format!(".{}", ext.to_lowercase())) {
              entries.push(p.to_string_lossy().to_string());
            }
          }
        } else {
          entries.push(p.to_string_lossy().to_string());
        }
      }
    }

    entries.sort();
    Ok(entries)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn remove_path(target: String) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
    let path = PathBuf::from(&target);
    if path.is_dir() {
      fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else if path.exists() {
      fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
      Ok(())
    }
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_dna_db(app: AppHandle, records: Vec<FrameDna>) -> Result<(), String> {
  let path = dna_db_path(&app)?;
  tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(&records).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn load_dna_db(app: AppHandle) -> Result<Vec<FrameDna>, String> {
  let path = dna_db_path(&app)?;
  tauri::async_runtime::spawn_blocking(move || -> Result<Vec<FrameDna>, String> {
    if !path.exists() {
      return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data = serde_json::from_str::<Vec<FrameDna>>(&content).map_err(|e| e.to_string())?;
    Ok(data)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn load_settings(app: AppHandle) -> Result<SettingsData, String> {
  let path = app_storage_dir(&app)?.join(SETTINGS_FILE);
  tauri::async_runtime::spawn_blocking(move || -> Result<SettingsData, String> {
    if !path.exists() {
      return Ok(SettingsData::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data = serde_json::from_str::<SettingsData>(&content).unwrap_or_default();
    Ok(data)
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_settings(app: AppHandle, data: SettingsData) -> Result<(), String> {
  let path = app_storage_dir(&app)?.join(SETTINGS_FILE);
  tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let payload = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&path, payload).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn validate_card_key(key: String) -> Result<bool, String> {
  Ok(!key.trim().is_empty())
}

#[tauri::command]
async fn generate_new_key(duration: String) -> Result<GeneratedKey, String> {
  let sanitized = duration.replace(|c: char| !c.is_ascii_alphanumeric(), "");
  let random_part = Utc::now().timestamp();
  Ok(GeneratedKey { key: format!("KEY-{sanitized}-{random_part}") })
}

// ------------------ 入口 ------------------
fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      analyze_url,
      download_video,
      analyze_niche,
      analyze_risk,
      extract_frames,
      list_directory,
      remove_path,
      save_dna_db,
      load_dna_db,
      load_settings,
      save_settings,
      validate_card_key,
      generate_new_key
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

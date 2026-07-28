use std::fs;
use std::path::PathBuf;

use tauri::Manager;

/// 保存先は %APPDATA%\jp.temmie0232.tool\data.json。
/// 完全ローカル完結で、外部には一切送信しない。
fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("保存先フォルダを取得できませんでした: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("保存先フォルダを作成できませんでした: {e}"))?;
    Ok(dir.join("data.json"))
}

/// 保存済みデータを読む。まだ一度も保存していなければ None。
#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = data_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("データを読めませんでした: {e}"))
}

/// 一時ファイルに書いてから置き換える。書き込み中にクラッシュしても既存データを壊さない。
#[tauri::command]
fn save_data(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = data_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("保存できませんでした: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("保存できませんでした: {e}"))
}

/// データファイルの場所(バックアップ画面で表示する)
#[tauri::command]
fn data_file_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_path(&app)?.to_string_lossy().to_string())
}

/// バックアップ書き出し(保存ダイアログで選ばれたパスへ)
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents.as_bytes()).map_err(|e| format!("書き出せませんでした: {e}"))
}

/// バックアップ読み込み(開くダイアログで選ばれたパスから)
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("読み込めませんでした: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            data_file_path,
            write_text_file,
            read_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::fs;
use std::path::PathBuf;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

/// 開発ビルドと本番を並べて常駐させるので、名前で見分けが付くようにする。
/// Alt+Tab・タスクバー・トレイのツールチップに出るのはここ。
/// ウィンドウに枠が無く画面の中には題名が出ないため、フロント側にも印を出している
/// (`Layout.tsx` の「開発」表示と、掴む取っ手の色)。
#[cfg(debug_assertions)]
const APP_TITLE: &str = "ツール (開発)";
#[cfg(not(debug_assertions))]
const APP_TITLE: &str = "ツール";

/// 常駐アプリなので、ウィンドウは「閉じる」ではなく「隠す」。ここが唯一の復帰口。
fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 表示中なら隠す、隠れていれば出す(トレイクリックと呼び出しキー共通)
fn toggle_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            show_main(app);
        }
    }
}

/// 常に前面に置く/やめる を切り替える。
/// 前面に固定するなら見えていないと意味がないので、隠れていたら出す。
fn toggle_pin(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let next = !window.is_always_on_top().unwrap_or(false);
        let _ = window.set_always_on_top(next);
        if next {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        // 画面の表示を合わせるためフロントへ知らせる
        let _ = window.emit("pin-changed", next);
    }
}

/// 起動時に前回の固定状態を復元するために使う
#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, value: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(value);
    }
}

/// トレイの「終了」から呼ぶ。書きかけの保存はフロント側で済ませてから来る
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// ウィンドウを隠す(常駐したまま画面から消す)
#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

/// 保存先は %APPDATA%\jp.temmie0232.tool\data.json。
/// 完全ローカル完結で、外部には一切送信しない。
///
/// 開発ビルドは data.dev.json を使う。作りかけの機能の不具合で
/// 実データを壊さないため。初回だけ実データを複製して中身を揃える。
fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("保存先フォルダを取得できませんでした: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("保存先フォルダを作成できませんでした: {e}"))?;

    if cfg!(debug_assertions) {
        let dev = dir.join("data.dev.json");
        if !dev.exists() {
            let real = dir.join("data.json");
            if real.exists() {
                let _ = fs::copy(&real, &dev);
            }
        }
        return Ok(dev);
    }
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

/// 一時ファイルに書き、ディスクへ同期してから置き換える。
/// 書き込み中のクラッシュや電源断でも既存データを壊さない。
#[tauri::command]
fn save_data(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    use std::io::Write;
    let path = data_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    {
        let mut file =
            fs::File::create(&tmp).map_err(|e| format!("保存できませんでした: {e}"))?;
        file.write_all(contents.as_bytes())
            .map_err(|e| format!("保存できませんでした: {e}"))?;
        // renameの前にディスクへ届いたことを保証する(電源断で空ファイルが残らないように)
        file.sync_all()
            .map_err(|e| format!("保存できませんでした: {e}"))?;
    }
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

// ---- 録音 ----

/// 録音ファイルの置き場。data.json と同じフォルダの下に置く。
/// データファイルと同じく、開発ビルドは別フォルダを使う
fn recordings_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("保存先フォルダを取得できませんでした: {e}"))?
        .join(if cfg!(debug_assertions) {
            "recordings.dev"
        } else {
            "recordings"
        });
    fs::create_dir_all(&dir).map_err(|e| format!("録音フォルダを作成できませんでした: {e}"))?;
    Ok(dir)
}

/// 画面から渡された名前をそのままパスに使わない。フォルダの外に出られないようにする
fn recording_path(app: &tauri::AppHandle, file_name: &str) -> Result<PathBuf, String> {
    let safe: String = file_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect();
    if safe.is_empty() || safe.contains("..") {
        return Err("録音ファイル名が不正です".into());
    }
    Ok(recordings_dir(app)?.join(safe))
}

/// 録音の断片を追記する。録音中ずっと書き足していくので、
/// 途中でアプリが落ちてもそこまでは残る。
#[tauri::command]
fn append_recording(
    app: tauri::AppHandle,
    file_name: String,
    chunk_base64: String,
) -> Result<u64, String> {
    use base64::Engine as _;
    use std::io::Write;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(chunk_base64.as_bytes())
        .map_err(|e| format!("録音データを読み取れませんでした: {e}"))?;
    let path = recording_path(&app, &file_name)?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("録音を保存できませんでした: {e}"))?;
    file.write_all(&bytes)
        .map_err(|e| format!("録音を保存できませんでした: {e}"))?;
    file.metadata()
        .map(|m| m.len())
        .map_err(|e| format!("録音を保存できませんでした: {e}"))
}

/// 再生用に録音を丸ごと読む。バイナリのまま返すので変換の無駄がない
#[tauri::command]
fn read_recording(app: tauri::AppHandle, file_name: String) -> Result<tauri::ipc::Response, String> {
    let path = recording_path(&app, &file_name)?;
    let bytes = fs::read(&path).map_err(|e| format!("録音を読み込めませんでした: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn delete_recording(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let path = recording_path(&app, &file_name)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("録音を削除できませんでした: {e}"))?;
    }
    Ok(())
}

/// データフォルダをエクスプローラーで開く
#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("保存先フォルダを取得できませんでした: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("保存先フォルダを作成できませんでした: {e}"))?;
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("エクスプローラーを開けませんでした: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // 2重起動したら新しく開かず、既存ウィンドウを前面に出す。
    // 同じdata.jsonを2つのプロセスが書き合って消し合う事故を防ぐ。
    // 開発ビルドでは付けない(常駐中の本番版がいると dev が起動できなくなるため。
    // データファイルも別なので衝突しない)
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // トレイに隠れている状態でショートカットから起動されたときも、ちゃんと出す
        show_main(app);
    }));

    builder
        // ウィンドウの位置とサイズを覚えて、次回同じ場所に開く
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        // Windowsのログオン時に自動起動する(--minimized付きなので画面には出ない)
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 同時に常駐していても Alt+Tab とタスクバーで見分けられるようにする
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(APP_TITLE);
            }

            // ---- トレイ常駐 ----
            // ウィンドウを隠してもここから戻れる。閉じるボタンを廃止したので必須
            let show = MenuItem::with_id(app, "show", "表示 (Ctrl+Alt+T)", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            // 開発版が常駐していると同じ絵柄のアイコンが2つ並ぶ。
            // どちらを右クリックしたのかメニュー自体で分かるように、名前を頭に出す
            let header = MenuItem::with_id(app, "header", APP_TITLE, false, None::<&str>)?;
            let menu = if cfg!(debug_assertions) {
                Menu::with_items(app, &[&header, &show, &quit])?
            } else {
                Menu::with_items(app, &[&show, &quit])?
            };
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                // トレイのアイコンは同じ絵柄なので、どちらかは名前で確かめる
                .tooltip(APP_TITLE)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => {
                        // 書きかけを保存してもらってから落とす。
                        // フロントが応答しない場合に備えて、受け取れなければ即終了
                        match app.get_webview_window("main") {
                            Some(window) => {
                                if window.emit("app-quit", ()).is_err() {
                                    app.exit(0);
                                }
                            }
                            None => app.exit(0),
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- 呼び出しキー(どのアプリを使っていても Ctrl+Alt+T で出せる)----
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };
                let summon = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT);
                let pin = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if event.state() != ShortcutState::Pressed {
                                return;
                            }
                            if shortcut == &summon {
                                toggle_main(app);
                            } else if shortcut == &pin {
                                toggle_pin(app);
                            }
                        })
                        .build(),
                )?;
                // 他のアプリに取られていても、アプリ自体は動かす
                let _ = app.global_shortcut().register(summon);
                let _ = app.global_shortcut().register(pin);
            }

            // 自動起動で立ち上がったときは、画面に出さずトレイに常駐するだけにする
            if std::env::args().any(|arg| arg == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            data_file_path,
            write_text_file,
            read_text_file,
            open_data_dir,
            hide_window,
            quit_app,
            set_always_on_top,
            append_recording,
            read_recording,
            delete_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

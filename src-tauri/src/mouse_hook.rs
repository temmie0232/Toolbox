//! Logicoolマウスのサイドボタン(手前側/戻る・奥側/進む)を toolbox 専用にするためのフック。
//! 会社PCではLogicool純正アプリ(Options+/G HUB)を入れられないので、
//! ドライバ無しでもOSがそのまま送ってくる XBUTTON1/XBUTTON2 を自前の低レベルフックで横取りする。
//! 両方とも CallNextHookEx を呼ばずに消費し、ブラウザ等の戻る/進むとしては一切使えなくする。
//! 手前側(XBUTTON1)だけ呼び出しキーとして使い、奥側(XBUTTON2)は何もしない。

use std::sync::OnceLock;

use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
    MSLLHOOKSTRUCT, MSG, WH_MOUSE_LL, WM_XBUTTONDBLCLK, WM_XBUTTONDOWN, WM_XBUTTONUP, XBUTTON1,
    XBUTTON2,
};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// 専用スレッドでフックを張り、メッセージループを回し続ける。
/// `WH_MOUSE_LL` はフックを張ったスレッドにメッセージポンプが無いと配送されないため。
pub fn install(app: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app);
    std::thread::spawn(|| unsafe {
        let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(hook_proc), std::ptr::null_mut(), 0);
        if hook.is_null() {
            eprintln!("[mouse_hook] 登録失敗(GetLastError等は未取得)");
            return;
        }
        eprintln!("[mouse_hook] 登録成功");
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let msg = wparam as u32;
    // down/up/dblclk のどれかだけでも通すとブラウザの戻る/進むが発火するので全部消費する
    if code >= 0 && matches!(msg, WM_XBUTTONDOWN | WM_XBUTTONUP | WM_XBUTTONDBLCLK) {
        let data = &*(lparam as *const MSLLHOOKSTRUCT);
        let button = (data.mouseData >> 16) & 0xFFFF;
        if msg == WM_XBUTTONDOWN && button == XBUTTON1 as u32 {
            if let Some(app) = APP_HANDLE.get() {
                crate::toggle_main(app);
            }
        }
        if button == XBUTTON1 as u32 || button == XBUTTON2 as u32 {
            return 1; // ここで消費し、戻る/進むとしては後段(ブラウザ等)に渡さない
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

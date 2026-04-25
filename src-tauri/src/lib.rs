mod pty;

use pty::{CreateTerminalRequest, ResizeTerminalRequest, TerminalInputRequest, TerminalRegistry};

/**
 * 创建新的终端 PTY 会话。
 */
#[tauri::command]
fn create_terminal_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalRegistry>,
    request: CreateTerminalRequest,
) -> Result<pty::TerminalSession, String> {
    state.create_session(app, request)
}

/**
 * 将前端输入写入指定终端会话。
 */
#[tauri::command]
fn write_terminal_input(
    state: tauri::State<'_, TerminalRegistry>,
    request: TerminalInputRequest,
) -> Result<(), String> {
    state.write_input(request)
}

/**
 * 调整指定终端会话的 PTY 行列尺寸。
 */
#[tauri::command]
fn resize_terminal_session(
    state: tauri::State<'_, TerminalRegistry>,
    request: ResizeTerminalRequest,
) -> Result<(), String> {
    state.resize_session(request)
}

/**
 * 关闭指定终端会话并释放后端资源。
 */
#[tauri::command]
fn close_terminal_session(
    state: tauri::State<'_, TerminalRegistry>,
    session_id: String,
) -> Result<(), String> {
    state.close_session(&session_id)
}

/**
 * 启动 Tauri 应用并注册终端后端命令。
 */
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalRegistry::default())
        .invoke_handler(tauri::generate_handler![
            create_terminal_session,
            write_terminal_input,
            resize_terminal_session,
            close_terminal_session
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Muxdeck");
}

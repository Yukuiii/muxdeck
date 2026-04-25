use crate::error::AppResult;
use crate::pty::{
    CreateTerminalRequest, ResizeTerminalRequest, TerminalInputRequest, TerminalRegistry,
    TerminalSession,
};

/**
 * 创建新的终端 PTY 会话。
 */
#[tauri::command]
pub fn create_terminal_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, TerminalRegistry>,
    request: CreateTerminalRequest,
) -> AppResult<TerminalSession> {
    state.create_session(app, request)
}

/**
 * 将前端输入写入指定终端会话。
 */
#[tauri::command]
pub fn write_terminal_input(
    state: tauri::State<'_, TerminalRegistry>,
    request: TerminalInputRequest,
) -> AppResult<()> {
    state.write_input(request)
}

/**
 * 调整指定终端会话的 PTY 行列尺寸。
 */
#[tauri::command]
pub fn resize_terminal_session(
    state: tauri::State<'_, TerminalRegistry>,
    request: ResizeTerminalRequest,
) -> AppResult<()> {
    state.resize_session(request)
}

/**
 * 关闭指定终端会话并释放后端资源。
 */
#[tauri::command]
pub fn close_terminal_session(
    state: tauri::State<'_, TerminalRegistry>,
    session_id: String,
) -> AppResult<()> {
    state.close_session(&session_id)
}

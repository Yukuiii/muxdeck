use crate::error::{AppError, AppResult};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
};
use tauri::Emitter;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTerminalRequest {
    pub session_id: String,
    pub cwd: Option<String>,
    pub rows: u16,
    pub cols: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInputRequest {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeTerminalRequest {
    pub session_id: String,
    pub rows: u16,
    pub cols: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub session_id: String,
    pub cwd: String,
    pub shell: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputPayload {
    session_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
    session_id: String,
    reason: String,
}

pub struct TerminalRegistry {
    sessions: TerminalSessions,
}

struct TerminalProcess {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

type TerminalSessions = Arc<Mutex<HashMap<String, TerminalProcess>>>;

impl Default for TerminalRegistry {
    /**
     * 创建空的终端会话注册表。
     */
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl TerminalRegistry {
    /**
     * 创建 PTY 会话、启动 shell，并开始转发输出事件。
     */
    pub fn create_session(
        &self,
        app: tauri::AppHandle,
        request: CreateTerminalRequest,
    ) -> AppResult<TerminalSession> {
        let shell = default_shell();
        let cwd = resolve_cwd(request.cwd)?;
        let mut command = CommandBuilder::new(&shell);
        command.cwd(&cwd);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: request.rows,
                cols: request.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| {
                AppError::terminal_pty_failed(format!("failed to open PTY: {error}"))
            })?;

        let child = pair.slave.spawn_command(command).map_err(|error| {
            AppError::terminal_pty_failed(format!("failed to spawn shell: {error}"))
        })?;
        let reader = pair.master.try_clone_reader().map_err(|error| {
            AppError::terminal_pty_failed(format!("failed to clone PTY reader: {error}"))
        })?;
        let writer = pair.master.take_writer().map_err(|error| {
            AppError::terminal_pty_failed(format!("failed to create PTY writer: {error}"))
        })?;

        drop(pair.slave);

        let session = TerminalSession {
            session_id: request.session_id.clone(),
            cwd: cwd.to_string_lossy().to_string(),
            shell,
        };
        let process = TerminalProcess {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        };

        self.sessions
            .lock()
            .map_err(|_| {
                AppError::terminal_registry_poisoned("terminal registry lock is poisoned")
            })?
            .insert(request.session_id.clone(), process);
        spawn_output_reader(
            app,
            Arc::clone(&self.sessions),
            request.session_id.clone(),
            reader,
        );

        Ok(session)
    }

    /**
     * 将输入字节写入指定 PTY 会话。
     */
    pub fn write_input(&self, request: TerminalInputRequest) -> AppResult<()> {
        let sessions = self.sessions.lock().map_err(|_| {
            AppError::terminal_registry_poisoned("terminal registry lock is poisoned")
        })?;
        let process = sessions
            .get(&request.session_id)
            .ok_or_else(|| AppError::terminal_session_not_found(&request.session_id))?;

        let result = {
            let mut writer = process.writer.lock().map_err(|_| {
                AppError::terminal_registry_poisoned("terminal writer lock is poisoned")
            })?;

            writer.write_all(request.data.as_bytes()).map_err(|error| {
                AppError::terminal_io_failed(format!("failed to write PTY input: {error}"))
            })
        };

        result
    }

    /**
     * 调整指定 PTY 会话的行列尺寸。
     */
    pub fn resize_session(&self, request: ResizeTerminalRequest) -> AppResult<()> {
        let sessions = self.sessions.lock().map_err(|_| {
            AppError::terminal_registry_poisoned("terminal registry lock is poisoned")
        })?;
        let process = sessions
            .get(&request.session_id)
            .ok_or_else(|| AppError::terminal_session_not_found(&request.session_id))?;

        let result = {
            let master = process.master.lock().map_err(|_| {
                AppError::terminal_registry_poisoned("terminal master lock is poisoned")
            })?;

            master
                .resize(PtySize {
                    rows: request.rows,
                    cols: request.cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|error| {
                    AppError::terminal_pty_failed(format!("failed to resize PTY: {error}"))
                })
        };

        result
    }

    /**
     * 关闭指定 PTY 会话并从注册表移除。
     */
    pub fn close_session(&self, session_id: &str) -> AppResult<()> {
        let process = self
            .sessions
            .lock()
            .map_err(|_| {
                AppError::terminal_registry_poisoned("terminal registry lock is poisoned")
            })?
            .remove(session_id);

        if let Some(process) = process {
            terminate_terminal_process(process)?;
        }

        Ok(())
    }
}

/**
 * 选择当前平台默认 shell。
 */
fn default_shell() -> String {
    if cfg!(windows) {
        env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

/**
 * 解析工作目录，未提供时使用当前进程目录。
 */
fn resolve_cwd(cwd: Option<String>) -> AppResult<PathBuf> {
    match cwd {
        Some(value) => {
            let path = PathBuf::from(value);

            if path.is_dir() {
                Ok(path)
            } else {
                Err(AppError::directory_not_found(
                    "terminal working directory does not exist",
                ))
            }
        }
        None => env::current_dir()
            .map_err(|error| AppError::directory_not_found(format!("failed to read cwd: {error}"))),
    }
}

/**
 * 终止用户关闭的 PTY 子进程并等待系统回收进程句柄。
 */
fn terminate_terminal_process(process: TerminalProcess) -> AppResult<()> {
    let TerminalProcess {
        master,
        writer,
        child,
    } = process;

    drop(writer);
    drop(master);

    let mut child = child
        .lock()
        .map_err(|_| AppError::terminal_registry_poisoned("terminal child lock is poisoned"))?;

    let _ = child.kill();
    let _ = child.wait();

    Ok(())
}

/**
 * 等待自然退出的 PTY 子进程完成，避免后端注册表残留。
 */
fn reap_terminal_process(process: TerminalProcess) {
    let TerminalProcess {
        master,
        writer,
        child,
    } = process;

    drop(writer);
    drop(master);

    if let Ok(mut child) = child.lock() {
        let _ = child.wait();
    };
}

/**
 * 在后台线程读取 PTY 输出并转发为 Tauri 事件。
 */
fn spawn_output_reader(
    app: tauri::AppHandle,
    sessions: TerminalSessions,
    session_id: String,
    mut reader: Box<dyn Read + Send>,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let _ = app.emit(
                        "terminal-output",
                        TerminalOutputPayload {
                            session_id: session_id.clone(),
                            data: buffer[..size].to_vec(),
                        },
                    );
                }
                Err(error) => {
                    remove_and_terminate_session(&sessions, &session_id);
                    let _ = app.emit(
                        "terminal-exit",
                        TerminalExitPayload {
                            session_id: session_id.clone(),
                            reason: error.to_string(),
                        },
                    );
                    return;
                }
            }
        }

        remove_and_reap_session(&sessions, &session_id);
        let _ = app.emit(
            "terminal-exit",
            TerminalExitPayload {
                session_id,
                reason: "pty closed".to_string(),
            },
        );
    });
}

/**
 * 从注册表移除指定 PTY 会话并回收其子进程。
 */
fn remove_and_reap_session(sessions: &TerminalSessions, session_id: &str) {
    let process = sessions
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(session_id));

    if let Some(process) = process {
        reap_terminal_process(process);
    }
}

/**
 * 从注册表移除读失败的 PTY 会话并主动终止其子进程。
 */
fn remove_and_terminate_session(sessions: &TerminalSessions, session_id: &str) {
    let process = sessions
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(session_id));

    if let Some(process) = process {
        let _ = terminate_terminal_process(process);
    }
}

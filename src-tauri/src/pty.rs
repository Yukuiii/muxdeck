use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::PathBuf,
    sync::Mutex,
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
    sessions: Mutex<HashMap<String, TerminalProcess>>,
}

struct TerminalProcess {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

impl Default for TerminalRegistry {
    /**
     * 创建空的终端会话注册表。
     */
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
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
    ) -> Result<TerminalSession, String> {
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
            .map_err(|error| format!("failed to open PTY: {error}"))?;

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| format!("failed to spawn shell: {error}"))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| format!("failed to clone PTY reader: {error}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| format!("failed to create PTY writer: {error}"))?;

        drop(pair.slave);
        spawn_output_reader(app, request.session_id.clone(), reader);

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
            .map_err(|_| "terminal registry lock is poisoned".to_string())?
            .insert(request.session_id, process);

        Ok(session)
    }

    /**
     * 将输入字节写入指定 PTY 会话。
     */
    pub fn write_input(&self, request: TerminalInputRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal registry lock is poisoned".to_string())?;
        let process = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("terminal session not found: {}", request.session_id))?;

        let result = {
            let mut writer = process
                .writer
                .lock()
                .map_err(|_| "terminal writer lock is poisoned".to_string())?;

            writer
                .write_all(request.data.as_bytes())
                .map_err(|error| format!("failed to write PTY input: {error}"))
        };

        result
    }

    /**
     * 调整指定 PTY 会话的行列尺寸。
     */
    pub fn resize_session(&self, request: ResizeTerminalRequest) -> Result<(), String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| "terminal registry lock is poisoned".to_string())?;
        let process = sessions
            .get(&request.session_id)
            .ok_or_else(|| format!("terminal session not found: {}", request.session_id))?;

        let result = {
            let master = process
                .master
                .lock()
                .map_err(|_| "terminal master lock is poisoned".to_string())?;

            master
                .resize(PtySize {
                    rows: request.rows,
                    cols: request.cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|error| format!("failed to resize PTY: {error}"))
        };

        result
    }

    /**
     * 关闭指定 PTY 会话并从注册表移除。
     */
    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let process = self
            .sessions
            .lock()
            .map_err(|_| "terminal registry lock is poisoned".to_string())?
            .remove(session_id);

        if let Some(process) = process {
            let _ = process
                .child
                .lock()
                .map_err(|_| "terminal child lock is poisoned".to_string())?
                .kill();
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
fn resolve_cwd(cwd: Option<String>) -> Result<PathBuf, String> {
    match cwd {
        Some(value) => Ok(PathBuf::from(value)),
        None => env::current_dir().map_err(|error| format!("failed to read cwd: {error}")),
    }
}

/**
 * 在后台线程读取 PTY 输出并转发为 Tauri 事件。
 */
fn spawn_output_reader(
    app: tauri::AppHandle,
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

        let _ = app.emit(
            "terminal-exit",
            TerminalExitPayload {
                session_id,
                reason: "pty closed".to_string(),
            },
        );
    });
}

use serde::Serialize;
use std::fmt;

/**
 * 表示后端业务错误的稳定分类码。
 */
#[derive(Clone, Copy, Debug)]
pub enum ErrorCode {
    DirectoryNotFound,
    GitCommandFailed,
    GitCommandTimedOut,
    GitOutputFailed,
    NotGitRepository,
    TerminalIoFailed,
    TerminalPtyFailed,
    TerminalRegistryPoisoned,
    TerminalSessionNotFound,
    ValidationFailed,
}

impl ErrorCode {
    /**
     * 返回前端和日志可稳定依赖的错误码字符串。
     */
    fn as_str(self) -> &'static str {
        match self {
            Self::DirectoryNotFound => "DIRECTORY_NOT_FOUND",
            Self::GitCommandFailed => "GIT_COMMAND_FAILED",
            Self::GitCommandTimedOut => "GIT_COMMAND_TIMED_OUT",
            Self::GitOutputFailed => "GIT_OUTPUT_FAILED",
            Self::NotGitRepository => "NOT_GIT_REPOSITORY",
            Self::TerminalIoFailed => "TERMINAL_IO_FAILED",
            Self::TerminalPtyFailed => "TERMINAL_PTY_FAILED",
            Self::TerminalRegistryPoisoned => "TERMINAL_REGISTRY_POISONED",
            Self::TerminalSessionNotFound => "TERMINAL_SESSION_NOT_FOUND",
            Self::ValidationFailed => "VALIDATION_FAILED",
        }
    }
}

/**
 * 表示 Tauri command 可序列化返回给前端的统一错误结构。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    code: &'static str,
    message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    /**
     * 按错误码和展示信息创建统一错误。
     */
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code: code.as_str(),
            message: message.into(),
        }
    }

    /**
     * 创建目录不存在错误。
     */
    pub fn directory_not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::DirectoryNotFound, message)
    }

    /**
     * 创建 Git 命令执行失败错误。
     */
    pub fn git_command_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::GitCommandFailed, message)
    }

    /**
     * 创建 Git 命令超时错误。
     */
    pub fn git_command_timed_out(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::GitCommandTimedOut, message)
    }

    /**
     * 创建 Git 输出读取失败错误。
     */
    pub fn git_output_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::GitOutputFailed, message)
    }

    /**
     * 创建非 Git 仓库错误。
     */
    pub fn not_git_repository(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotGitRepository, message)
    }

    /**
     * 创建终端 IO 错误。
     */
    pub fn terminal_io_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::TerminalIoFailed, message)
    }

    /**
     * 创建 PTY 初始化或控制错误。
     */
    pub fn terminal_pty_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::TerminalPtyFailed, message)
    }

    /**
     * 创建终端注册表锁污染错误。
     */
    pub fn terminal_registry_poisoned(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::TerminalRegistryPoisoned, message)
    }

    /**
     * 创建终端会话不存在错误。
     */
    pub fn terminal_session_not_found(session_id: &str) -> Self {
        Self::new(
            ErrorCode::TerminalSessionNotFound,
            format!("terminal session not found: {session_id}"),
        )
    }

    /**
     * 创建输入校验错误。
     */
    pub fn validation_failed(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::ValidationFailed, message)
    }
}

impl fmt::Display for AppError {
    /**
     * 输出带错误码的人类可读错误信息。
     */
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

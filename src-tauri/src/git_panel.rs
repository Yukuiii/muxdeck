use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
const GIT_POLL_INTERVAL: Duration = Duration::from_millis(25);
const MAX_UNTRACKED_LINE_COUNT_BYTES: u64 = 1024 * 1024;

/**
 * 描述前端请求 Git 面板数据所需的工作目录。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPanelRequest {
    cwd: String,
}

/**
 * 描述前端提交 Git commit 所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitRequest {
    cwd: String,
    message: String,
}

/**
 * 描述前端暂存所有未暂存变更所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStageRequest {
    cwd: String,
}

/**
 * 描述前端暂存单个文件所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStageFileRequest {
    cwd: String,
    path: String,
}

/**
 * 描述前端取消暂存所有文件所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUnstageRequest {
    cwd: String,
}

/**
 * 描述前端取消暂存单个文件所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUnstageFileRequest {
    cwd: String,
    path: String,
}

/**
 * 描述前端加载单文件 diff 所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRequest {
    cwd: String,
    path: String,
    staged: bool,
}

/**
 * 描述 Git commit 成功后的结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    hash: String,
}

/**
 * 描述暂存所有变更后的结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStageResult {
    staged: bool,
}

/**
 * 描述取消暂存成功后的结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUnstageResult {
    unstaged: bool,
}

/**
 * 描述单文件 diff 的返回内容。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    path: String,
    staged: bool,
    content: String,
}

/**
 * 描述右侧 Git 面板展示所需的数据。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPanelState {
    is_repository: bool,
    branch: Option<String>,
    unstaged_changes: Vec<GitChange>,
    staged_changes: Vec<GitChange>,
    history: Vec<GitCommit>,
}

/**
 * 描述一条已暂存文件变更。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    status: String,
    path: String,
    additions: u32,
    deletions: u32,
}

/**
 * 描述单个文件的 diff 行数统计。
 */
#[derive(Clone, Copy, Debug, Default)]
struct DiffLineCount {
    additions: u32,
    deletions: u32,
}

/**
 * 描述一次 Git 命令执行后的退出状态和输出。
 */
struct GitCommandOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

/**
 * 描述一条 Git 提交历史。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    hash: String,
    short_hash: String,
    subject: String,
    author: String,
    relative_time: String,
    refs: String,
}

/**
 * 组织 Git 面板相关业务流程。
 */
pub struct GitPanelService;

impl GitPanelService {
    /**
     * 读取指定目录的 Git 暂存变更和提交历史。
     */
    pub fn load_panel(&self, request: GitPanelRequest) -> AppResult<GitPanelState> {
        let cwd = Path::new(&request.cwd);

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Ok(GitPanelState {
                is_repository: false,
                branch: None,
                unstaged_changes: Vec::new(),
                staged_changes: Vec::new(),
                history: Vec::new(),
            });
        }

        Ok(GitPanelState {
            is_repository: true,
            branch: read_branch(cwd),
            unstaged_changes: read_unstaged_changes(cwd)?,
            staged_changes: read_staged_changes(cwd)?,
            history: read_history(cwd)?,
        })
    }

    /**
     * 使用当前暂存区创建一个 Git commit。
     */
    pub fn commit_staged_changes(&self, request: GitCommitRequest) -> AppResult<GitCommitResult> {
        let cwd = Path::new(&request.cwd);
        let message = request.message.trim();

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        if message.is_empty() {
            return Err(AppError::validation_failed("commit message is required"));
        }

        if !has_staged_changes(cwd)? {
            return Err(AppError::validation_failed("no staged changes to commit"));
        }

        run_git(cwd, &["commit", "-m", message])?;

        Ok(GitCommitResult {
            hash: run_git(cwd, &["rev-parse", "HEAD"])?.trim().to_string(),
        })
    }

    /**
     * 将工作区中所有未暂存变更加入 Git 暂存区。
     */
    pub fn stage_unstaged_changes(&self, request: GitStageRequest) -> AppResult<GitStageResult> {
        let cwd = Path::new(&request.cwd);

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        run_git(cwd, &["add", "--all"])?;

        Ok(GitStageResult { staged: true })
    }

    /**
     * 将指定文件加入 Git 暂存区。
     */
    pub fn stage_file(&self, request: GitStageFileRequest) -> AppResult<GitStageResult> {
        let cwd = Path::new(&request.cwd);
        let path = request.path.trim();

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        if path.is_empty() {
            return Err(AppError::validation_failed("file path is required"));
        }

        run_git(cwd, &["add", "--", path])?;

        Ok(GitStageResult { staged: true })
    }

    /**
     * 将所有已暂存文件移回未暂存区。
     */
    pub fn unstage_all(&self, request: GitUnstageRequest) -> AppResult<GitUnstageResult> {
        let cwd = Path::new(&request.cwd);

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        run_git(cwd, &["reset", "--", "."])?;

        Ok(GitUnstageResult { unstaged: true })
    }

    /**
     * 将指定已暂存文件移回未暂存区。
     */
    pub fn unstage_file(&self, request: GitUnstageFileRequest) -> AppResult<GitUnstageResult> {
        let cwd = Path::new(&request.cwd);
        let path = request.path.trim();

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        if path.is_empty() {
            return Err(AppError::validation_failed("file path is required"));
        }

        run_git(cwd, &["reset", "--", path])?;

        Ok(GitUnstageResult { unstaged: true })
    }

    /**
     * 读取指定文件在暂存区或工作区中的 diff 内容。
     */
    pub fn load_file_diff(&self, request: GitDiffRequest) -> AppResult<GitDiffResult> {
        let cwd = Path::new(&request.cwd);
        let path = request.path.trim();

        if !cwd.is_dir() {
            return Err(AppError::directory_not_found(
                "project directory does not exist",
            ));
        }

        if !is_git_repository(cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        if path.is_empty() {
            return Err(AppError::validation_failed("file path is required"));
        }

        let mut content = if request.staged {
            run_git(cwd, &["diff", "--cached", "--", path])?
        } else {
            run_git(cwd, &["diff", "--", path])?
        };

        if !request.staged && content.trim().is_empty() && is_untracked_file(cwd, path)? {
            content = build_untracked_file_diff(cwd, path)?;
        }

        Ok(GitDiffResult {
            path: path.to_string(),
            staged: request.staged,
            content,
        })
    }
}

/**
 * 判断目录是否位于一个 Git 仓库内。
 */
fn is_git_repository(cwd: &Path) -> bool {
    run_git(cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|output| output.trim() == "true")
        .unwrap_or(false)
}

/**
 * 读取当前分支名，detached HEAD 时回退到短提交哈希。
 */
fn read_branch(cwd: &Path) -> Option<String> {
    run_git(cwd, &["branch", "--show-current"])
        .ok()
        .map(|output| output.trim().to_string())
        .filter(|branch| !branch.is_empty())
        .or_else(|| {
            run_git(cwd, &["rev-parse", "--short", "HEAD"])
                .ok()
                .map(|output| output.trim().to_string())
                .filter(|hash| !hash.is_empty())
        })
}

/**
 * 判断暂存区是否存在可提交的变更。
 */
fn has_staged_changes(cwd: &Path) -> AppResult<bool> {
    let output = run_git_command(cwd, &["diff", "--cached", "--quiet"])?;

    match output.status.code() {
        Some(0) => Ok(false),
        Some(1) => Ok(true),
        _ => Err(AppError::git_command_failed(
            "failed to inspect staged changes",
        )),
    }
}

/**
 * 读取暂存区文件变更列表。
 */
fn read_staged_changes(cwd: &Path) -> AppResult<Vec<GitChange>> {
    read_diff_changes(
        cwd,
        &["diff", "--cached", "--name-status", "-z"],
        &["diff", "--cached", "--numstat", "-z"],
    )
}

/**
 * 读取 Git diff 文件变更及对应行数统计。
 */
fn read_diff_changes(
    cwd: &Path,
    name_status_args: &[&str],
    numstat_args: &[&str],
) -> AppResult<Vec<GitChange>> {
    let output = run_git(cwd, name_status_args)?;
    let line_counts = read_diff_line_counts(cwd, numstat_args)?;

    Ok(parse_name_status_output(&output)
        .into_iter()
        .map(|mut change| {
            if let Some(count) = line_counts.get(&change.path) {
                change.additions = count.additions;
                change.deletions = count.deletions;
            }

            change
        })
        .collect())
}

/**
 * 读取工作区未暂存和未跟踪的文件变更列表。
 */
fn read_unstaged_changes(cwd: &Path) -> AppResult<Vec<GitChange>> {
    let mut changes = read_diff_changes(
        cwd,
        &["diff", "--name-status", "-z"],
        &["diff", "--numstat", "-z"],
    )?;

    changes.extend(read_untracked_changes(cwd)?);

    Ok(changes)
}

/**
 * 读取未被 Git 跟踪的文件列表。
 */
fn read_untracked_changes(cwd: &Path) -> AppResult<Vec<GitChange>> {
    let output = run_git(cwd, &["ls-files", "--others", "--exclude-standard", "-z"])?;

    Ok(output
        .split_terminator('\0')
        .filter(|path| !path.trim().is_empty())
        .map(|path| GitChange {
            status: "??".to_string(),
            path: path.to_string(),
            additions: count_file_lines(cwd.join(path).as_path()),
            deletions: 0,
        })
        .collect())
}

/**
 * 读取 Git numstat 输出并按文件路径建立行数索引。
 */
fn read_diff_line_counts(
    cwd: &Path,
    numstat_args: &[&str],
) -> AppResult<HashMap<String, DiffLineCount>> {
    let output = run_git(cwd, numstat_args)?;

    Ok(parse_numstat_output(&output).into_iter().collect())
}

/**
 * 读取最近的提交历史。
 */
fn read_history(cwd: &Path) -> AppResult<Vec<GitCommit>> {
    if run_git(cwd, &["rev-parse", "--verify", "HEAD"]).is_err() {
        return Ok(Vec::new());
    }

    let output = run_git(
        cwd,
        &[
            "log",
            "--date=relative",
            "--decorate=short",
            "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ar%x1f%D%x1e",
            "-n",
            "30",
        ],
    )?;

    Ok(output
        .split('\x1e')
        .filter_map(parse_commit_record)
        .collect())
}

/**
 * 判断指定路径是否为当前仓库中的未跟踪文件。
 */
fn is_untracked_file(cwd: &Path, path: &str) -> AppResult<bool> {
    let output = run_git(
        cwd,
        &["ls-files", "--others", "--exclude-standard", "-z", "--", path],
    )?;

    Ok(output
        .split_terminator('\0')
        .any(|entry| entry == path))
}

/**
 * 为未跟踪文件构造统一 diff 文本，供前端按新增文件展示内容。
 */
fn build_untracked_file_diff(cwd: &Path, path: &str) -> AppResult<String> {
    let file_path = cwd.join(path);
    let bytes = fs::read(&file_path)
        .map_err(|error| AppError::git_output_failed(format!("failed to read file: {error}")))?;

    if bytes.contains(&0) {
        return Ok(build_binary_untracked_file_diff(path));
    }

    if bytes.is_empty() {
        return Ok(build_empty_untracked_file_diff(path));
    }

    let content = String::from_utf8_lossy(&bytes);
    let has_trailing_newline = bytes.last() == Some(&b'\n');
    let mut lines: Vec<&str> = content.split('\n').collect();

    if has_trailing_newline {
        let _ = lines.pop();
    }

    if lines.is_empty() {
        return Ok(build_empty_untracked_file_diff(path));
    }

    let mut diff = String::new();
    diff.push_str(&format!("diff --git a/{path} b/{path}\n"));
    diff.push_str("--- /dev/null\n");
    diff.push_str(&format!("+++ b/{path}\n"));
    diff.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));

    for line in lines {
        diff.push('+');
        diff.push_str(line);
        diff.push('\n');
    }

    Ok(diff)
}

/**
 * 为二进制未跟踪文件构造可读占位 diff。
 */
fn build_binary_untracked_file_diff(path: &str) -> String {
    let mut diff = String::new();
    diff.push_str(&format!("diff --git a/{path} b/{path}\n"));
    diff.push_str("--- /dev/null\n");
    diff.push_str(&format!("+++ b/{path}\n"));
    diff.push_str("@@ -0,0 +1,1 @@\n");
    diff.push_str("+[Binary file not shown]\n");

    diff
}

/**
 * 为内容为空的未跟踪文件构造可读占位 diff。
 */
fn build_empty_untracked_file_diff(path: &str) -> String {
    let mut diff = String::new();
    diff.push_str(&format!("diff --git a/{path} b/{path}\n"));
    diff.push_str("--- /dev/null\n");
    diff.push_str(&format!("+++ b/{path}\n"));
    diff.push_str("@@ -0,0 +1,1 @@\n");
    diff.push_str("+[Empty file]\n");

    diff
}

/**
 * 解析 git diff --name-status -z 输出中的文件变更。
 */
fn parse_name_status_output(output: &str) -> Vec<GitChange> {
    let mut fields = output.split_terminator('\0');
    let mut changes = Vec::new();

    while let Some(status) = fields.next() {
        let path = if is_two_path_status(status) {
            let _old_path = fields.next();
            fields.next()
        } else {
            fields.next()
        };

        if let Some(path) = path.filter(|path| !path.is_empty()) {
            changes.push(GitChange {
                status: status.to_string(),
                path: path.to_string(),
                additions: 0,
                deletions: 0,
            });
        }
    }

    changes
}

/**
 * 解析 git diff --numstat -z 输出中的行数统计。
 */
fn parse_numstat_output(output: &str) -> Vec<(String, DiffLineCount)> {
    let mut fields = output.split_terminator('\0');
    let mut line_counts = Vec::new();

    while let Some(record) = fields.next() {
        let mut parts = record.splitn(3, '\t');
        let additions = parts.next();
        let deletions = parts.next();
        let path = parts.next();

        let (Some(additions), Some(deletions), Some(path)) = (additions, deletions, path) else {
            continue;
        };
        let path = if path.is_empty() {
            let _old_path = fields.next();
            fields.next()
        } else {
            Some(path)
        };

        if let Some(path) = path.filter(|path| !path.is_empty()) {
            line_counts.push((
                path.to_string(),
                DiffLineCount {
                    additions: parse_numstat_count(additions),
                    deletions: parse_numstat_count(deletions),
                },
            ));
        }
    }

    line_counts
}

/**
 * 解析 numstat 中的行数字段，二进制文件返回 0。
 */
fn parse_numstat_count(value: &str) -> u32 {
    value.parse::<u32>().unwrap_or(0)
}

/**
 * 判断 name-status 状态是否包含旧路径和新路径两个字段。
 */
fn is_two_path_status(status: &str) -> bool {
    status.starts_with('R') || status.starts_with('C')
}

/**
 * 统计未跟踪文本文件的行数，二进制或不可读文件返回 0。
 */
fn count_file_lines(path: &Path) -> u32 {
    let Ok(metadata) = fs::metadata(path) else {
        return 0;
    };

    if metadata.len() > MAX_UNTRACKED_LINE_COUNT_BYTES {
        return 0;
    }

    let Ok(bytes) = fs::read(path) else {
        return 0;
    };

    if bytes.is_empty() || bytes.contains(&0) {
        return 0;
    }

    let newline_count = bytes.iter().filter(|byte| **byte == b'\n').count();
    let has_trailing_newline = bytes.last() == Some(&b'\n');
    let line_count = if has_trailing_newline {
        newline_count
    } else {
        newline_count + 1
    };

    u32::try_from(line_count).unwrap_or(u32::MAX)
}

/**
 * 解析自定义 pretty format 输出中的单条提交。
 */
fn parse_commit_record(record: &str) -> Option<GitCommit> {
    let fields: Vec<&str> = record.trim_matches('\n').split('\x1f').collect();

    if fields.len() < 6 || fields[0].is_empty() {
        return None;
    }

    Some(GitCommit {
        hash: fields[0].to_string(),
        short_hash: fields[1].to_string(),
        subject: fields[2].to_string(),
        author: fields[3].to_string(),
        relative_time: fields[4].to_string(),
        refs: fields[5].to_string(),
    })
}

/**
 * 在指定目录中执行固定参数的 Git 命令并返回标准输出。
 */
fn run_git(cwd: &Path, args: &[&str]) -> AppResult<String> {
    let output = run_git_command(cwd, args)?;

    if !output.status.success() {
        return Err(AppError::git_command_failed(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/**
 * 在指定目录中执行 Git 命令并按固定超时时间收集输出。
 */
fn run_git_command(cwd: &Path, args: &[&str]) -> AppResult<GitCommandOutput> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::git_command_failed(format!("failed to run git: {error}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::git_output_failed("failed to capture git stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::git_output_failed("failed to capture git stderr"))?;
    let stdout_reader = thread::spawn(move || read_process_pipe(stdout));
    let stderr_reader = thread::spawn(move || read_process_pipe(stderr));
    let deadline = Instant::now() + GIT_COMMAND_TIMEOUT;

    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            AppError::git_command_failed(format!("failed to wait for git: {error}"))
        })? {
            break status;
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(AppError::git_command_timed_out(format!(
                "git command timed out: git {}",
                args.join(" ")
            )));
        }

        thread::sleep(GIT_POLL_INTERVAL);
    };

    Ok(GitCommandOutput {
        status,
        stdout: join_pipe_reader(stdout_reader, "stdout")?,
        stderr: join_pipe_reader(stderr_reader, "stderr")?,
    })
}

/**
 * 读取子进程管道中的所有字节。
 */
fn read_process_pipe(mut pipe: impl Read) -> AppResult<Vec<u8>> {
    let mut bytes = Vec::new();

    pipe.read_to_end(&mut bytes).map_err(|error| {
        AppError::git_output_failed(format!("failed to read git output: {error}"))
    })?;

    Ok(bytes)
}

/**
 * 等待读取线程结束并把 panic 转为可展示错误。
 */
fn join_pipe_reader(
    reader: thread::JoinHandle<AppResult<Vec<u8>>>,
    stream_name: &str,
) -> AppResult<Vec<u8>> {
    match reader.join() {
        Ok(result) => result,
        Err(_) => Err(AppError::git_output_failed(format!(
            "failed to join git {stream_name} reader"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /**
     * 验证 name-status 的 NUL 分隔解析能保留特殊文件名并选择重命名后的路径。
     */
    #[test]
    fn parse_name_status_output_handles_nul_separated_paths() {
        let changes = parse_name_status_output(
            "M\0src/a\tb.rs\0R100\0old\nname.rs\0new\nname.rs\0C100\0base.rs\0copy.rs\0",
        );

        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].status, "M");
        assert_eq!(changes[0].path, "src/a\tb.rs");
        assert_eq!(changes[1].status, "R100");
        assert_eq!(changes[1].path, "new\nname.rs");
        assert_eq!(changes[2].status, "C100");
        assert_eq!(changes[2].path, "copy.rs");
    }

    /**
     * 验证 numstat 的 NUL 分隔解析能保留特殊文件名并把二进制统计归零。
     */
    #[test]
    fn parse_numstat_output_handles_nul_separated_paths() {
        let line_counts = parse_numstat_output(
            "3\t1\tsrc/a\tb.rs\0-\t-\tbin.dat\012\t0\t\0old\nname.rs\0new\nname.rs\0",
        );

        assert_eq!(line_counts.len(), 3);
        assert_eq!(line_counts[0].0, "src/a\tb.rs");
        assert_eq!(line_counts[0].1.additions, 3);
        assert_eq!(line_counts[0].1.deletions, 1);
        assert_eq!(line_counts[1].0, "bin.dat");
        assert_eq!(line_counts[1].1.additions, 0);
        assert_eq!(line_counts[1].1.deletions, 0);
        assert_eq!(line_counts[2].0, "new\nname.rs");
        assert_eq!(line_counts[2].1.additions, 12);
        assert_eq!(line_counts[2].1.deletions, 0);
    }
}

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
 * 描述 Git commit 成功后的结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    hash: String,
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
    pub fn load_panel(&self, request: GitPanelRequest) -> Result<GitPanelState, String> {
        let cwd = Path::new(&request.cwd);

        if !cwd.is_dir() {
            return Err("project directory does not exist".to_string());
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
    pub fn commit_staged_changes(
        &self,
        request: GitCommitRequest,
    ) -> Result<GitCommitResult, String> {
        let cwd = Path::new(&request.cwd);
        let message = request.message.trim();

        if !cwd.is_dir() {
            return Err("project directory does not exist".to_string());
        }

        if !is_git_repository(cwd) {
            return Err("not a git repository".to_string());
        }

        if message.is_empty() {
            return Err("commit message is required".to_string());
        }

        if !has_staged_changes(cwd)? {
            return Err("no staged changes to commit".to_string());
        }

        run_git(cwd, &["commit", "-m", message])?;

        Ok(GitCommitResult {
            hash: run_git(cwd, &["rev-parse", "HEAD"])?.trim().to_string(),
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
fn has_staged_changes(cwd: &Path) -> Result<bool, String> {
    let output = run_git_command(cwd, &["diff", "--cached", "--quiet"])?;

    match output.status.code() {
        Some(0) => Ok(false),
        Some(1) => Ok(true),
        _ => Err("failed to inspect staged changes".to_string()),
    }
}

/**
 * 读取暂存区文件变更列表。
 */
fn read_staged_changes(cwd: &Path) -> Result<Vec<GitChange>, String> {
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
) -> Result<Vec<GitChange>, String> {
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
fn read_unstaged_changes(cwd: &Path) -> Result<Vec<GitChange>, String> {
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
fn read_untracked_changes(cwd: &Path) -> Result<Vec<GitChange>, String> {
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
) -> Result<HashMap<String, DiffLineCount>, String> {
    let output = run_git(cwd, numstat_args)?;

    Ok(parse_numstat_output(&output).into_iter().collect())
}

/**
 * 读取最近的提交历史。
 */
fn read_history(cwd: &Path) -> Result<Vec<GitCommit>, String> {
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
fn run_git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let output = run_git_command(cwd, args)?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/**
 * 在指定目录中执行 Git 命令并按固定超时时间收集输出。
 */
fn run_git_command(cwd: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to run git: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture git stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture git stderr".to_string())?;
    let stdout_reader = thread::spawn(move || read_process_pipe(stdout));
    let stderr_reader = thread::spawn(move || read_process_pipe(stderr));
    let deadline = Instant::now() + GIT_COMMAND_TIMEOUT;

    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("failed to wait for git: {error}"))?
        {
            break status;
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(format!("git command timed out: git {}", args.join(" ")));
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
fn read_process_pipe(mut pipe: impl Read) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();

    pipe.read_to_end(&mut bytes)
        .map_err(|error| format!("failed to read git output: {error}"))?;

    Ok(bytes)
}

/**
 * 等待读取线程结束并把 panic 转为可展示错误。
 */
fn join_pipe_reader(
    reader: thread::JoinHandle<Result<Vec<u8>, String>>,
    stream_name: &str,
) -> Result<Vec<u8>, String> {
    match reader.join() {
        Ok(result) => result,
        Err(_) => Err(format!("failed to join git {stream_name} reader")),
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

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

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
 * 读取指定目录的 Git 暂存变更和提交历史。
 */
#[tauri::command]
pub fn load_git_panel(request: GitPanelRequest) -> Result<GitPanelState, String> {
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
#[tauri::command]
pub fn commit_staged_git_changes(request: GitCommitRequest) -> Result<GitCommitResult, String> {
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
    let status = Command::new("git")
        .args(["diff", "--cached", "--quiet"])
        .current_dir(cwd)
        .status()
        .map_err(|error| format!("failed to run git: {error}"))?;

    match status.code() {
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
        &["diff", "--cached", "--name-status"],
        &["diff", "--cached", "--numstat"],
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

    Ok(output
        .lines()
        .filter_map(parse_name_status_line)
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
    let mut changes = read_diff_changes(cwd, &["diff", "--name-status"], &["diff", "--numstat"])?;

    changes.extend(read_untracked_changes(cwd)?);

    Ok(changes)
}

/**
 * 读取未被 Git 跟踪的文件列表。
 */
fn read_untracked_changes(cwd: &Path) -> Result<Vec<GitChange>, String> {
    let output = run_git(cwd, &["ls-files", "--others", "--exclude-standard"])?;

    Ok(output
        .lines()
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

    Ok(output
        .lines()
        .filter_map(parse_numstat_line)
        .collect::<HashMap<_, _>>())
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
 * 解析 git diff --name-status 输出中的单行变更。
 */
fn parse_name_status_line(line: &str) -> Option<GitChange> {
    let parts: Vec<&str> = line.split('\t').collect();

    if parts.len() < 2 {
        return None;
    }

    Some(GitChange {
        status: parts[0].to_string(),
        path: parts.last()?.to_string(),
        additions: 0,
        deletions: 0,
    })
}

/**
 * 解析 git diff --numstat 输出中的单行行数统计。
 */
fn parse_numstat_line(line: &str) -> Option<(String, DiffLineCount)> {
    let parts: Vec<&str> = line.split('\t').collect();

    if parts.len() < 3 {
        return None;
    }

    Some((
        normalize_numstat_path(parts.last()?),
        DiffLineCount {
            additions: parse_numstat_count(parts[0]),
            deletions: parse_numstat_count(parts[1]),
        },
    ))
}

/**
 * 解析 numstat 中的行数字段，二进制文件返回 0。
 */
fn parse_numstat_count(value: &str) -> u32 {
    value.parse::<u32>().unwrap_or(0)
}

/**
 * 将 numstat 的重命名路径格式规范化为新路径。
 */
fn normalize_numstat_path(path: &str) -> String {
    if let (Some(open), Some(close)) = (path.find('{'), path.find('}')) {
        let inner = &path[open + 1..close];

        if let Some((_, new_name)) = inner.split_once(" => ") {
            return format!("{}{}{}", &path[..open], new_name, &path[close + 1..]);
        }
    }

    path.split(" => ").last().unwrap_or(path).trim().to_string()
}

/**
 * 统计未跟踪文本文件的行数，二进制或不可读文件返回 0。
 */
fn count_file_lines(path: &Path) -> u32 {
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
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("failed to run git: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

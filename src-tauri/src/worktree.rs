use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const GIT_COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
const GIT_POLL_INTERVAL: Duration = Duration::from_millis(25);

/**
 * 描述前端请求读取项目和 worktree 结构所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProjectInspectionRequest {
    cwd: String,
}

/**
 * 描述前端请求创建 linked worktree 所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateWorktreeRequest {
    cwd: String,
    branch: String,
}

/**
 * 描述前端请求删除 linked worktree 所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoveWorktreeRequest {
    cwd: String,
    path: String,
}

/**
 * 描述单个 Git worktree 的静态信息。
 */
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeEntry {
    cwd: String,
    branch: Option<String>,
    is_main: bool,
}

/**
 * 描述指定目录所属项目的 Git/worktree 结构。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProjectInspectionResult {
    repo_root: String,
    repo_name: String,
    current_worktree_path: String,
    is_repository: bool,
    worktrees: Vec<GitWorktreeEntry>,
}

/**
 * 描述创建 linked worktree 后的返回结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCreateWorktreeResult {
    worktree: GitWorktreeEntry,
}

/**
 * 描述删除 linked worktree 的返回结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoveWorktreeResult {
    removed: bool,
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
 * 组织 Git worktree 相关业务流程。
 */
pub struct WorktreeService;

impl WorktreeService {
    /**
     * 读取指定目录所属项目的 worktree 结构。
     */
    pub fn inspect_project(
        &self,
        request: GitProjectInspectionRequest,
    ) -> AppResult<GitProjectInspectionResult> {
        let cwd = resolve_existing_directory(&request.cwd)?;

        inspect_project_at_path(&cwd)
    }

    /**
     * 基于当前 worktree 的 HEAD 创建一个新分支，并生成 linked worktree。
     */
    pub fn create_worktree(
        &self,
        request: GitCreateWorktreeRequest,
    ) -> AppResult<GitCreateWorktreeResult> {
        let cwd = resolve_existing_directory(&request.cwd)?;

        if !is_git_repository(&cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        let branch = request.branch.trim();

        if branch.is_empty() {
            return Err(AppError::validation_failed("branch name is required"));
        }

        let inspection = inspect_project_at_path(&cwd)?;

        if has_local_branch(&cwd, branch)? {
            return Err(AppError::validation_failed(format!(
                "branch already exists: {branch}"
            )));
        }

        let target_path =
            build_managed_worktree_path(&inspection.repo_root, &inspection.repo_name, branch)?;

        if target_path.exists() {
            return Err(AppError::validation_failed(format!(
                "worktree path already exists: {}",
                target_path.display()
            )));
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                AppError::git_output_failed(format!(
                    "failed to create worktree parent directory: {error}"
                ))
            })?;
        }

        run_git(
            &cwd,
            &[
                "worktree",
                "add",
                "-b",
                branch,
                target_path.to_string_lossy().as_ref(),
            ],
        )?;

        Ok(GitCreateWorktreeResult {
            worktree: GitWorktreeEntry {
                cwd: normalize_existing_path(&target_path)?,
                branch: Some(branch.to_string()),
                is_main: false,
            },
        })
    }

    /**
     * 删除指定 linked worktree。
     */
    pub fn remove_worktree(
        &self,
        request: GitRemoveWorktreeRequest,
    ) -> AppResult<GitRemoveWorktreeResult> {
        let cwd = resolve_existing_directory(&request.cwd)?;

        if !is_git_repository(&cwd) {
            return Err(AppError::not_git_repository("not a git repository"));
        }

        let path = request.path.trim();

        if path.is_empty() {
            return Err(AppError::validation_failed("worktree path is required"));
        }

        let inspection = inspect_project_at_path(&cwd)?;
        let target_worktree = inspection
            .worktrees
            .iter()
            .find(|worktree| paths_match(&worktree.cwd, path));

        match target_worktree {
            Some(worktree) if worktree.is_main => {
                return Err(AppError::validation_failed(
                    "main worktree cannot be removed",
                ));
            }
            Some(_) => {}
            None => {
                return Err(AppError::validation_failed(
                    "worktree does not belong to the current project",
                ));
            }
        }

        run_git(&cwd, &["worktree", "remove", path])?;

        Ok(GitRemoveWorktreeResult { removed: true })
    }
}

/**
 * 读取指定目录所属项目的结构信息。
 */
fn inspect_project_at_path(cwd: &Path) -> AppResult<GitProjectInspectionResult> {
    let normalized_cwd = normalize_existing_path(cwd)?;

    if !is_git_repository(cwd) {
        return Ok(GitProjectInspectionResult {
            repo_root: normalized_cwd.clone(),
            repo_name: file_name_or_path(&normalized_cwd),
            current_worktree_path: normalized_cwd.clone(),
            is_repository: false,
            worktrees: vec![GitWorktreeEntry {
                cwd: normalized_cwd,
                branch: None,
                is_main: true,
            }],
        });
    }

    let current_worktree_path = normalize_existing_path(Path::new(
        run_git(
            cwd,
            &["rev-parse", "--path-format=absolute", "--show-toplevel"],
        )?
        .trim(),
    ))?;
    let repo_root = repo_root_from_common_dir(cwd)?;
    let repo_name = file_name_or_path(&repo_root);
    let mut worktrees = run_git(cwd, &["worktree", "list", "--porcelain"])?
        .split("\n\n")
        .filter_map(|entry| parse_worktree_entry(entry.trim()))
        .filter_map(|entry| normalize_worktree_entry(entry, &repo_root).transpose())
        .collect::<AppResult<Vec<_>>>()?;

    worktrees.sort_by(|left, right| {
        if left.is_main != right.is_main {
            return if left.is_main {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }

        left.cwd.cmp(&right.cwd)
    });

    Ok(GitProjectInspectionResult {
        repo_root,
        repo_name,
        current_worktree_path,
        is_repository: true,
        worktrees,
    })
}

/**
 * 解析单个 porcelain worktree 块。
 */
fn parse_worktree_entry(entry: &str) -> Option<GitWorktreeEntry> {
    let mut cwd = None;
    let mut branch = None;

    for line in entry.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            cwd = Some(path.trim().to_string());
            continue;
        }

        if let Some(branch_ref) = line.strip_prefix("branch ") {
            branch = branch_ref
                .trim()
                .strip_prefix("refs/heads/")
                .map(ToOwned::to_owned)
                .or_else(|| Some(branch_ref.trim().to_string()));
        }
    }

    cwd.map(|cwd| GitWorktreeEntry {
        is_main: false,
        cwd,
        branch,
    })
}

/**
 * 统一规范化 worktree 路径，并在目标目录失效时跳过陈旧 worktree 条目。
 */
fn normalize_worktree_entry(
    mut entry: GitWorktreeEntry,
    repo_root: &str,
) -> AppResult<Option<GitWorktreeEntry>> {
    let worktree_path = Path::new(&entry.cwd);

    if !worktree_path.is_dir() {
        return Ok(None);
    }

    entry.cwd = normalize_existing_path(worktree_path)?;
    entry.is_main = paths_match(&entry.cwd, repo_root);

    Ok(Some(entry))
}

/**
 * 判断指定本地分支是否存在。
 */
fn has_local_branch(cwd: &Path, branch: &str) -> AppResult<bool> {
    let output = run_git_command(
        cwd,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )?;

    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(AppError::git_command_failed(
            "failed to inspect local branch",
        )),
    }
}

/**
 * 根据仓库根目录和分支名生成受管 worktree 目标路径。
 */
fn build_managed_worktree_path(
    repo_root: &str,
    repo_name: &str,
    branch: &str,
) -> AppResult<PathBuf> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| AppError::validation_failed("home directory is not available"))?;
    let repo_hash = stable_hash_hex(repo_root.as_bytes(), 6);
    let branch_hash = stable_hash_hex(branch.as_bytes(), 4);
    let repo_dir_name = format!("{}-{}", slugify(repo_name), repo_hash);
    let worktree_dir_name = format!("{}-{}", slugify(branch), branch_hash);

    Ok(home_dir
        .join(".muxdeck")
        .join("worktrees")
        .join(repo_dir_name)
        .join(worktree_dir_name))
}

/**
 * 从 Git common dir 推导项目主仓库根目录。
 */
fn repo_root_from_common_dir(cwd: &Path) -> AppResult<String> {
    let common_dir = run_git(
        cwd,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?
    .trim()
    .to_string();
    let repo_root = Path::new(&common_dir).parent().ok_or_else(|| {
        AppError::git_output_failed("failed to resolve repository root from git common dir")
    })?;

    normalize_existing_path(repo_root)
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
 * 解析并规范化一个已经存在的目录路径。
 */
fn resolve_existing_directory(path: &str) -> AppResult<PathBuf> {
    let cwd = Path::new(path);

    if !cwd.is_dir() {
        return Err(AppError::directory_not_found(
            "project directory does not exist",
        ));
    }

    cwd.canonicalize().map_err(|error| {
        AppError::directory_not_found(format!("failed to resolve directory: {error}"))
    })
}

/**
 * 将已有路径规范化为可稳定比较和序列化的绝对路径。
 */
fn normalize_existing_path(path: &Path) -> AppResult<String> {
    path.canonicalize()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| AppError::directory_not_found(format!("failed to resolve path: {error}")))
}

/**
 * 判断两个路径字符串是否指向同一路径。
 */
fn paths_match(left: &str, right: &str) -> bool {
    Path::new(left) == Path::new(right)
}

/**
 * 从路径字符串提取最后一级目录名，失败时回退到原始路径。
 */
fn file_name_or_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(ToOwned::to_owned)
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| path.to_string())
}

/**
 * 将输入字符串转换为适合目录名的稳定 slug。
 */
fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_is_dash = false;

    for character in value.chars() {
        let normalized = if character.is_ascii_alphanumeric() {
            Some(character.to_ascii_lowercase())
        } else if matches!(character, '-' | '_' | '.') {
            Some(character)
        } else {
            Some('-')
        };

        let Some(character) = normalized else {
            continue;
        };

        if character == '-' {
            if previous_is_dash || slug.is_empty() {
                continue;
            }

            previous_is_dash = true;
            slug.push(character);
            continue;
        }

        previous_is_dash = false;
        slug.push(character);
    }

    let normalized = slug.trim_matches('-').to_string();

    if normalized.is_empty() {
        return "worktree".to_string();
    }

    normalized
}

/**
 * 基于 FNV-1a 计算稳定的短十六进制哈希。
 */
fn stable_hash_hex(bytes: &[u8], length: usize) -> String {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x00000100000001b3;

    let mut hash = FNV_OFFSET;

    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }

    format!("{hash:016x}")[..length.min(16)].to_string()
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

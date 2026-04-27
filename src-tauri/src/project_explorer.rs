use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};

/**
 * 描述前端加载项目目录内容所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDirectoryRequest {
    cwd: String,
    path: Option<String>,
}

/**
 * 描述前端读取单个项目文件内容所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileRequest {
    cwd: String,
    path: String,
}

/**
 * 描述项目目录中的一个文件或目录节点。
 */
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDirectoryEntry {
    path: String,
    name: String,
    kind: ProjectEntryKind,
}

/**
 * 描述目录节点的分类。
 */
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectEntryKind {
    Directory,
    File,
}

/**
 * 描述目录读取后的返回结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDirectoryResult {
    path: String,
    entries: Vec<ProjectDirectoryEntry>,
}

/**
 * 描述单个项目文件内容的返回结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileResult {
    path: String,
    content: String,
    is_binary: bool,
}

/**
 * 组织项目文件树和文件内容读取流程。
 */
pub struct ProjectExplorerService;

impl ProjectExplorerService {
    /**
     * 读取指定目录下的直接子项列表。
     */
    pub fn load_directory(&self, request: ProjectDirectoryRequest) -> AppResult<ProjectDirectoryResult> {
        let cwd = canonicalize_project_root(&request.cwd)?;
        let relative_path = request.path.unwrap_or_default();
        let directory_path = resolve_project_path(&cwd, &relative_path)?;

        if !directory_path.is_dir() {
            return Err(AppError::directory_not_found("target directory does not exist"));
        }

        let mut entries = fs::read_dir(&directory_path)
            .map_err(|error| AppError::directory_not_found(format!("failed to read directory: {error}")))?
            .filter_map(Result::ok)
            .filter_map(|entry| create_directory_entry(&cwd, entry.path()))
            .collect::<Vec<_>>();

        entries.sort_by(compare_directory_entries);

        Ok(ProjectDirectoryResult {
            path: relative_path,
            entries,
        })
    }

    /**
     * 读取指定项目文件的文本内容或二进制占位信息。
     */
    pub fn read_file(&self, request: ProjectFileRequest) -> AppResult<ProjectFileResult> {
        let cwd = canonicalize_project_root(&request.cwd)?;
        let relative_path = request.path.trim();

        if relative_path.is_empty() {
            return Err(AppError::validation_failed("file path is required"));
        }

        let file_path = resolve_project_path(&cwd, relative_path)?;

        if !file_path.is_file() {
            return Err(AppError::directory_not_found("target file does not exist"));
        }

        let bytes = fs::read(&file_path)
            .map_err(|error| AppError::git_output_failed(format!("failed to read file: {error}")))?;

        if bytes.contains(&0) {
            return Ok(ProjectFileResult {
                path: relative_path.to_string(),
                content: "[Binary file not shown]".to_string(),
                is_binary: true,
            });
        }

        Ok(ProjectFileResult {
            path: relative_path.to_string(),
            content: String::from_utf8_lossy(&bytes).into_owned(),
            is_binary: false,
        })
    }
}

/**
 * 规范化项目根目录并确保它存在。
 */
fn canonicalize_project_root(cwd: &str) -> AppResult<PathBuf> {
    let root_path = Path::new(cwd);

    if !root_path.is_dir() {
        return Err(AppError::directory_not_found(
            "project directory does not exist",
        ));
    }

    fs::canonicalize(root_path)
        .map_err(|error| AppError::directory_not_found(format!("failed to resolve project directory: {error}")))
}

/**
 * 将相对项目路径解析为真实路径，并确保不会逃逸出项目根目录。
 */
fn resolve_project_path(cwd: &Path, relative_path: &str) -> AppResult<PathBuf> {
    let sanitized_path = sanitize_relative_path(relative_path)?;
    let candidate_path = cwd.join(sanitized_path);
    let canonical_path = fs::canonicalize(&candidate_path)
        .map_err(|error| AppError::directory_not_found(format!("failed to resolve path: {error}")))?;

    if !canonical_path.starts_with(cwd) {
        return Err(AppError::validation_failed(
            "target path must stay inside the project directory",
        ));
    }

    Ok(canonical_path)
}

/**
 * 清理用户传入的相对路径并阻止绝对路径和向上跳转。
 */
fn sanitize_relative_path(path: &str) -> AppResult<PathBuf> {
    let trimmed_path = path.trim();

    if trimmed_path.is_empty() {
        return Ok(PathBuf::new());
    }

    let candidate_path = Path::new(trimmed_path);
    let mut sanitized_path = PathBuf::new();

    for component in candidate_path.components() {
        match component {
            Component::Normal(value) => sanitized_path.push(value),
            Component::CurDir => continue,
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::validation_failed(
                    "target path must be a project-relative path",
                ));
            }
        }
    }

    Ok(sanitized_path)
}

/**
 * 为单个目录项构造可返回给前端的节点信息。
 */
fn create_directory_entry(cwd: &Path, entry_path: PathBuf) -> Option<ProjectDirectoryEntry> {
    let name = entry_path.file_name()?.to_string_lossy().to_string();

    if name == ".git" {
        return None;
    }

    let canonical_path = fs::canonicalize(&entry_path).ok()?;

    if !canonical_path.starts_with(cwd) {
        return None;
    }

    let metadata = fs::metadata(&canonical_path).ok()?;
    let relative_path = canonical_path
        .strip_prefix(cwd)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");

    Some(ProjectDirectoryEntry {
        path: relative_path,
        name,
        kind: if metadata.is_dir() {
            ProjectEntryKind::Directory
        } else {
            ProjectEntryKind::File
        },
    })
}

/**
 * 让目录优先于文件，并按名称稳定排序。
 */
fn compare_directory_entries(
    left: &ProjectDirectoryEntry,
    right: &ProjectDirectoryEntry,
) -> Ordering {
    match (&left.kind, &right.kind) {
        (ProjectEntryKind::Directory, ProjectEntryKind::File) => Ordering::Less,
        (ProjectEntryKind::File, ProjectEntryKind::Directory) => Ordering::Greater,
        _ => left
            .name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase()),
    }
}

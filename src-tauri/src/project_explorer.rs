use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};

const DEFAULT_TEXT_SEARCH_RESULT_LIMIT: usize = 500;
const MAX_TEXT_SEARCH_FILE_BYTES: u64 = 1_048_576;
const MAX_TEXT_SEARCH_MATCHES_PER_FILE: usize = 40;
const MAX_TEXT_SEARCH_RESULT_LIMIT: usize = 1_000;

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
 * 描述前端加载项目全部文件路径所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileListRequest {
    cwd: String,
}

/**
 * 描述前端在项目内执行全文搜索所需的参数。
 */
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextSearchRequest {
    cwd: String,
    query: String,
    max_results: Option<usize>,
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
 * 描述一次项目全量文件路径读取的返回结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileListResult {
    paths: Vec<String>,
}

/**
 * 描述全文搜索命中的单行位置和预览内容。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextSearchLineMatch {
    line_number: usize,
    line_text: String,
    start_column: usize,
    end_column: usize,
}

/**
 * 描述全文搜索中单个文件的命中集合。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextSearchFileMatch {
    path: String,
    matches: Vec<ProjectTextSearchLineMatch>,
}

/**
 * 描述一次项目全文搜索的返回结果。
 */
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTextSearchResult {
    query: String,
    files: Vec<ProjectTextSearchFileMatch>,
    match_count: usize,
    truncated: bool,
}

/**
 * 组织项目文件树和文件内容读取流程。
 */
pub struct ProjectExplorerService;

impl ProjectExplorerService {
    /**
     * 读取指定目录下的直接子项列表。
     */
    pub fn load_directory(
        &self,
        request: ProjectDirectoryRequest,
    ) -> AppResult<ProjectDirectoryResult> {
        let cwd = canonicalize_project_root(&request.cwd)?;
        let relative_path = request.path.unwrap_or_default();
        let directory_path = resolve_project_path(&cwd, &relative_path)?;

        if !directory_path.is_dir() {
            return Err(AppError::directory_not_found(
                "target directory does not exist",
            ));
        }

        let mut entries = fs::read_dir(&directory_path)
            .map_err(|error| {
                AppError::directory_not_found(format!("failed to read directory: {error}"))
            })?
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
     * 递归读取当前项目中的全部文件路径。
     */
    pub fn list_files(&self, request: ProjectFileListRequest) -> AppResult<ProjectFileListResult> {
        let cwd = canonicalize_project_root(&request.cwd)?;
        let mut paths = Vec::new();

        collect_project_file_paths(&cwd, &cwd, &mut paths)?;
        paths.sort_by_key(|path| path.to_ascii_lowercase());

        Ok(ProjectFileListResult { paths })
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

        let bytes = fs::read(&file_path).map_err(|error| {
            AppError::git_output_failed(format!("failed to read file: {error}"))
        })?;

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

    /**
     * 在当前项目的文本文件中执行大小写不敏感的全文搜索。
     */
    pub fn search_text(
        &self,
        request: ProjectTextSearchRequest,
    ) -> AppResult<ProjectTextSearchResult> {
        let cwd = canonicalize_project_root(&request.cwd)?;
        let query = request.query.trim();

        if query.is_empty() {
            return Ok(ProjectTextSearchResult {
                query: String::new(),
                files: Vec::new(),
                match_count: 0,
                truncated: false,
            });
        }

        let max_results = resolve_text_search_result_limit(request.max_results);
        let normalized_query = query.to_ascii_lowercase();
        let mut paths = Vec::new();
        let mut files = Vec::new();
        let mut match_count = 0;
        let mut truncated = false;

        collect_project_file_paths(&cwd, &cwd, &mut paths)?;
        paths.sort_by_key(|path| path.to_ascii_lowercase());

        for relative_path in paths {
            if match_count >= max_results {
                truncated = true;
                break;
            }

            let file_path = match resolve_project_path(&cwd, &relative_path) {
                Ok(path) => path,
                Err(_) => continue,
            };
            let remaining_results = max_results - match_count;
            let (file_match, is_file_truncated) = search_text_in_file(
                &file_path,
                &relative_path,
                &normalized_query,
                remaining_results,
            )?;

            if let Some(file_match) = file_match {
                match_count += file_match.matches.len();
                files.push(file_match);
            }

            if is_file_truncated {
                truncated = true;
            }

            if match_count >= max_results {
                break;
            }
        }

        Ok(ProjectTextSearchResult {
            query: query.to_string(),
            files,
            match_count,
            truncated,
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

    fs::canonicalize(root_path).map_err(|error| {
        AppError::directory_not_found(format!("failed to resolve project directory: {error}"))
    })
}

/**
 * 将相对项目路径解析为真实路径，并确保不会逃逸出项目根目录。
 */
fn resolve_project_path(cwd: &Path, relative_path: &str) -> AppResult<PathBuf> {
    let sanitized_path = sanitize_relative_path(relative_path)?;
    let candidate_path = cwd.join(sanitized_path);
    let canonical_path = fs::canonicalize(&candidate_path).map_err(|error| {
        AppError::directory_not_found(format!("failed to resolve path: {error}"))
    })?;

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

    if should_ignore_project_directory(&name) {
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

/**
 * 判断当前目录名是否应从项目浏览与快速打开结果中忽略。
 */
fn should_ignore_project_directory(name: &str) -> bool {
    matches!(name, ".git" | "node_modules" | "dist" | "target")
}

/**
 * 递归收集项目根目录下的全部文件路径，并跳过依赖与构建产物目录。
 */
fn collect_project_file_paths(
    cwd: &Path,
    directory_path: &Path,
    paths: &mut Vec<String>,
) -> AppResult<()> {
    let entries = fs::read_dir(directory_path).map_err(|error| {
        AppError::directory_not_found(format!("failed to read directory: {error}"))
    })?;

    for entry in entries.filter_map(Result::ok) {
        let entry_path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if should_ignore_project_directory(&name) {
            continue;
        }

        let canonical_path = match fs::canonicalize(&entry_path) {
            Ok(path) => path,
            Err(_) => continue,
        };

        if !canonical_path.starts_with(cwd) {
            continue;
        }

        let metadata = match fs::metadata(&canonical_path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            collect_project_file_paths(cwd, &canonical_path, paths)?;
            continue;
        }

        if !metadata.is_file() {
            continue;
        }

        if let Ok(relative_path) = canonical_path.strip_prefix(cwd) {
            paths.push(relative_path.to_string_lossy().replace('\\', "/"));
        }
    }

    Ok(())
}

/**
 * 将前端传入的搜索结果上限归一化到后端允许范围内。
 */
fn resolve_text_search_result_limit(max_results: Option<usize>) -> usize {
    match max_results {
        Some(0) | None => DEFAULT_TEXT_SEARCH_RESULT_LIMIT,
        Some(limit) => limit.min(MAX_TEXT_SEARCH_RESULT_LIMIT),
    }
}

/**
 * 在单个文本文件中查找命中行并按剩余结果数量截断。
 */
fn search_text_in_file(
    file_path: &Path,
    relative_path: &str,
    normalized_query: &str,
    remaining_results: usize,
) -> AppResult<(Option<ProjectTextSearchFileMatch>, bool)> {
    if remaining_results == 0 {
        return Ok((None, true));
    }

    let metadata = fs::metadata(file_path)
        .map_err(|error| AppError::git_output_failed(format!("failed to inspect file: {error}")))?;

    if metadata.len() > MAX_TEXT_SEARCH_FILE_BYTES {
        return Ok((None, false));
    }

    let bytes = fs::read(file_path)
        .map_err(|error| AppError::git_output_failed(format!("failed to read file: {error}")))?;

    if bytes.contains(&0) {
        return Ok((None, false));
    }

    let content = String::from_utf8_lossy(&bytes);
    let mut matches = Vec::new();
    let mut truncated = false;

    for (line_index, line) in content.lines().enumerate() {
        let Some((start_column, end_column)) = find_text_match_columns(line, normalized_query)
        else {
            continue;
        };

        matches.push(ProjectTextSearchLineMatch {
            line_number: line_index + 1,
            line_text: line.trim_end_matches('\r').to_string(),
            start_column,
            end_column,
        });

        if matches.len() >= remaining_results || matches.len() >= MAX_TEXT_SEARCH_MATCHES_PER_FILE {
            truncated = true;
            break;
        }
    }

    if matches.is_empty() {
        return Ok((None, truncated));
    }

    Ok((
        Some(ProjectTextSearchFileMatch {
            path: relative_path.to_string(),
            matches,
        }),
        truncated,
    ))
}

/**
 * 在单行文本中查找首个大小写不敏感命中并返回一基列区间。
 */
fn find_text_match_columns(line: &str, normalized_query: &str) -> Option<(usize, usize)> {
    let normalized_line = line.to_ascii_lowercase();
    let start_byte = normalized_line.find(normalized_query)?;
    let end_byte = start_byte + normalized_query.len();
    let start_column = line[..start_byte].chars().count() + 1;
    let end_column = start_column + line[start_byte..end_byte].chars().count();

    Some((start_column, end_column))
}

#[cfg(test)]
mod tests {
    use super::{find_text_match_columns, should_ignore_project_directory};

    /**
     * 验证项目浏览会忽略依赖目录与构建产物目录。
     */
    #[test]
    fn should_ignore_common_generated_directories() {
        assert!(should_ignore_project_directory(".git"));
        assert!(should_ignore_project_directory("node_modules"));
        assert!(should_ignore_project_directory("dist"));
        assert!(should_ignore_project_directory("target"));
        assert!(!should_ignore_project_directory("src"));
        assert!(!should_ignore_project_directory("docs"));
    }

    /**
     * 验证文本搜索列号使用一基区间并忽略 ASCII 大小写。
     */
    #[test]
    fn should_find_case_insensitive_text_columns() {
        assert_eq!(
            find_text_match_columns("Hello Search", "search"),
            Some((7, 13))
        );
    }
}

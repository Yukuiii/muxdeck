use crate::error::AppResult;
use crate::project_explorer::{
    ProjectDirectoryRequest, ProjectDirectoryResult, ProjectExplorerService, ProjectFileListRequest,
    ProjectFileListResult, ProjectFileRequest, ProjectFileResult,
};

/**
 * 读取指定项目目录下的直接子项列表。
 */
#[tauri::command]
pub async fn load_project_directory(
    request: ProjectDirectoryRequest,
) -> AppResult<ProjectDirectoryResult> {
    tauri::async_runtime::spawn_blocking(move || ProjectExplorerService.load_directory(request))
        .await
        .map_err(|error| {
            crate::error::AppError::git_output_failed(format!(
                "failed to join project explorer worker: {error}"
            ))
        })?
}

/**
 * 加载指定项目下的全部文件路径。
 */
#[tauri::command]
pub async fn list_project_files(request: ProjectFileListRequest) -> AppResult<ProjectFileListResult> {
    tauri::async_runtime::spawn_blocking(move || ProjectExplorerService.list_files(request))
        .await
        .map_err(|error| {
            crate::error::AppError::git_output_failed(format!(
                "failed to join project file list worker: {error}"
            ))
        })?
}

/**
 * 读取指定项目文件的内容。
 */
#[tauri::command]
pub async fn read_project_file(request: ProjectFileRequest) -> AppResult<ProjectFileResult> {
    tauri::async_runtime::spawn_blocking(move || ProjectExplorerService.read_file(request))
        .await
        .map_err(|error| {
            crate::error::AppError::git_output_failed(format!(
                "failed to join project file worker: {error}"
            ))
        })?
}

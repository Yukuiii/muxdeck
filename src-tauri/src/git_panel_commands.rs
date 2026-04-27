use crate::error::AppResult;
use crate::git_panel::{
    GitAllDiffRequest, GitCommitRequest, GitCommitResult, GitDiffRequest, GitDiffResult,
    GitPanelRequest, GitPanelService, GitPanelState,
    GitStageFileRequest, GitStageRequest, GitStageResult, GitUnstageFileRequest,
    GitUnstageRequest, GitUnstageResult,
};

/**
 * 读取指定目录的 Git 暂存变更和提交历史。
 */
#[tauri::command]
pub async fn load_git_panel(request: GitPanelRequest) -> AppResult<GitPanelState> {
    tauri::async_runtime::spawn_blocking(move || GitPanelService.load_panel(request))
        .await
        .map_err(|error| {
            crate::error::AppError::git_output_failed(format!(
                "failed to join git panel worker: {error}"
            ))
        })?
}

/**
 * 使用当前暂存区创建一个 Git commit。
 */
#[tauri::command]
pub fn commit_staged_git_changes(request: GitCommitRequest) -> AppResult<GitCommitResult> {
    GitPanelService.commit_staged_changes(request)
}

/**
 * 将当前工作区所有未暂存变更加入暂存区。
 */
#[tauri::command]
pub fn stage_unstaged_git_changes(request: GitStageRequest) -> AppResult<GitStageResult> {
    GitPanelService.stage_unstaged_changes(request)
}

/**
 * 将指定文件加入暂存区。
 */
#[tauri::command]
pub fn stage_git_file(request: GitStageFileRequest) -> AppResult<GitStageResult> {
    GitPanelService.stage_file(request)
}

/**
 * 将所有已暂存文件移回未暂存区。
 */
#[tauri::command]
pub fn unstage_all_git_files(request: GitUnstageRequest) -> AppResult<GitUnstageResult> {
    GitPanelService.unstage_all(request)
}

/**
 * 将指定已暂存文件移回未暂存区。
 */
#[tauri::command]
pub fn unstage_git_file(request: GitUnstageFileRequest) -> AppResult<GitUnstageResult> {
    GitPanelService.unstage_file(request)
}

/**
 * 读取指定文件的 diff 内容。
 */
#[tauri::command]
pub fn load_git_file_diff(request: GitDiffRequest) -> AppResult<GitDiffResult> {
    GitPanelService.load_file_diff(request)
}

/**
 * 读取暂存区或工作区中全部文件的 diff 内容。
 */
#[tauri::command]
pub fn load_git_all_diffs(request: GitAllDiffRequest) -> AppResult<GitDiffResult> {
    GitPanelService.load_all_diffs(request)
}

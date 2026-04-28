use crate::error::AppResult;
use crate::worktree::{
    GitCreateWorktreeRequest, GitCreateWorktreeResult, GitProjectInspectionRequest,
    GitProjectInspectionResult, GitRemoveWorktreeRequest, GitRemoveWorktreeResult, WorktreeService,
};

/**
 * 读取指定目录所属项目的 worktree 结构。
 */
#[tauri::command]
pub async fn inspect_git_project(
    request: GitProjectInspectionRequest,
) -> AppResult<GitProjectInspectionResult> {
    tauri::async_runtime::spawn_blocking(move || WorktreeService.inspect_project(request))
        .await
        .map_err(|error| {
            crate::error::AppError::git_output_failed(format!(
                "failed to join worktree inspection worker: {error}"
            ))
        })?
}

/**
 * 基于当前 worktree 的 HEAD 创建一个新分支，并生成 linked worktree。
 */
#[tauri::command]
pub fn create_git_worktree(
    request: GitCreateWorktreeRequest,
) -> AppResult<GitCreateWorktreeResult> {
    WorktreeService.create_worktree(request)
}

/**
 * 删除指定 linked worktree。
 */
#[tauri::command]
pub fn remove_git_worktree(
    request: GitRemoveWorktreeRequest,
) -> AppResult<GitRemoveWorktreeResult> {
    WorktreeService.remove_worktree(request)
}

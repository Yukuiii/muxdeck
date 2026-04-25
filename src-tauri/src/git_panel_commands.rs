use crate::error::AppResult;
use crate::git_panel::{
    GitCommitRequest, GitCommitResult, GitPanelRequest, GitPanelService, GitPanelState,
    GitStageRequest, GitStageResult,
};

/**
 * 读取指定目录的 Git 暂存变更和提交历史。
 */
#[tauri::command]
pub fn load_git_panel(request: GitPanelRequest) -> AppResult<GitPanelState> {
    GitPanelService.load_panel(request)
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

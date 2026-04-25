use crate::git_panel::{
    GitCommitRequest, GitCommitResult, GitPanelRequest, GitPanelService, GitPanelState,
};

/**
 * 读取指定目录的 Git 暂存变更和提交历史。
 */
#[tauri::command]
pub fn load_git_panel(request: GitPanelRequest) -> Result<GitPanelState, String> {
    GitPanelService.load_panel(request)
}

/**
 * 使用当前暂存区创建一个 Git commit。
 */
#[tauri::command]
pub fn commit_staged_git_changes(request: GitCommitRequest) -> Result<GitCommitResult, String> {
    GitPanelService.commit_staged_changes(request)
}

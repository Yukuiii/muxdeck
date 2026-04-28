/**
 * 定义需要用户确认的系统对话框端口。
 */
export interface ConfirmationDialog {
  confirmGitCommit(message: string): Promise<boolean>;
  confirmWorktreeRemoval(title: string, path: string): Promise<boolean>;
}

import { confirm } from "@tauri-apps/plugin-dialog";
import type { ConfirmationDialog } from "../../application/system/ConfirmationDialog";

/**
 * 使用 Tauri Dialog 实现确认对话框端口。
 */
export class TauriConfirmationDialog implements ConfirmationDialog {
  /**
   * 确认用户是否要使用指定提交信息创建 Git commit。
   */
  confirmGitCommit(message: string): Promise<boolean> {
    return confirm(`Create a git commit with message:\n\n${message}`, {
      title: "Confirm Git Commit",
      kind: "warning",
      okLabel: "Commit",
      cancelLabel: "Cancel",
    });
  }
}

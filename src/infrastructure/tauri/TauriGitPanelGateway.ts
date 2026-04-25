import { invoke } from "@tauri-apps/api/core";
import type { GitPanelGateway } from "../../application/git/GitPanelGateway";
import type {
  GitCommitRequest,
  GitCommitResult,
  GitPanelRequest,
  GitPanelState,
} from "../../types/gitPanel";

/**
 * 使用 Tauri command 实现 Git 面板后端访问端口。
 */
export class TauriGitPanelGateway implements GitPanelGateway {
  /**
   * 加载指定目录的 Git 面板数据。
   */
  loadPanel(request: GitPanelRequest): Promise<GitPanelState> {
    return invoke<GitPanelState>("load_git_panel", { request });
  }

  /**
   * 使用当前暂存区创建 Git commit。
   */
  commitStagedChanges(request: GitCommitRequest): Promise<GitCommitResult> {
    return invoke<GitCommitResult>("commit_staged_git_changes", { request });
  }
}

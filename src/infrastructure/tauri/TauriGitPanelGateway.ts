import { invoke } from "@tauri-apps/api/core";
import type { GitPanelGateway } from "../../application/git/GitPanelGateway";
import type {
  GitAllDiffRequest,
  GitCommitRequest,
  GitCommitResult,
  GitDiffRequest,
  GitDiffResult,
  GitPanelRequest,
  GitPanelState,
  GitPushRequest,
  GitStageFileRequest,
  GitStageRequest,
  GitStageResult,
  GitUnstageFileRequest,
  GitUnstageRequest,
  GitUnstageResult,
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

  /**
   * 推送当前分支到远端仓库。
   */
  pushCurrentBranch(request: GitPushRequest): Promise<void> {
    return invoke<void>("push_git_branch", { request });
  }

  /**
   * 将工作区所有未暂存变更加入暂存区。
   */
  stageUnstagedChanges(request: GitStageRequest): Promise<GitStageResult> {
    return invoke<GitStageResult>("stage_unstaged_git_changes", { request });
  }

  /**
   * 将指定文件加入暂存区。
   */
  stageFile(request: GitStageFileRequest): Promise<GitStageResult> {
    return invoke<GitStageResult>("stage_git_file", { request });
  }

  /**
   * 将所有已暂存文件移回未暂存区。
   */
  unstageAll(request: GitUnstageRequest): Promise<GitUnstageResult> {
    return invoke<GitUnstageResult>("unstage_all_git_files", { request });
  }

  /**
   * 将指定已暂存文件移回未暂存区。
   */
  unstageFile(request: GitUnstageFileRequest): Promise<GitUnstageResult> {
    return invoke<GitUnstageResult>("unstage_git_file", { request });
  }

  /**
   * 加载指定文件的 diff 内容。
   */
  loadFileDiff(request: GitDiffRequest): Promise<GitDiffResult> {
    return invoke<GitDiffResult>("load_git_file_diff", { request });
  }

  /**
   * 加载暂存区或工作区中全部文件的 diff 内容。
   */
  loadAllDiffs(request: GitAllDiffRequest): Promise<GitDiffResult> {
    return invoke<GitDiffResult>("load_git_all_diffs", { request });
  }
}

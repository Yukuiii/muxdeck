import { invoke } from "@tauri-apps/api/core";
import type { WorktreeGateway } from "../../application/worktree/WorktreeGateway";
import type {
  GitCreateWorktreeRequest,
  GitCreateWorktreeResult,
  GitProjectInspectionRequest,
  GitProjectInspectionResult,
  GitRemoveWorktreeRequest,
  GitRemoveWorktreeResult,
} from "../../types/worktree";

/**
 * 使用 Tauri command 实现 Git worktree 后端访问端口。
 */
export class TauriWorktreeGateway implements WorktreeGateway {
  /**
   * 读取指定目录所属仓库和 worktree 结构。
   */
  inspectProject(
    request: GitProjectInspectionRequest,
  ): Promise<GitProjectInspectionResult> {
    return invoke<GitProjectInspectionResult>("inspect_git_project", { request });
  }

  /**
   * 基于当前 worktree 的 HEAD 创建新分支和 linked worktree。
   */
  createWorktree(
    request: GitCreateWorktreeRequest,
  ): Promise<GitCreateWorktreeResult> {
    return invoke<GitCreateWorktreeResult>("create_git_worktree", { request });
  }

  /**
   * 删除指定 linked worktree。
   */
  removeWorktree(
    request: GitRemoveWorktreeRequest,
  ): Promise<GitRemoveWorktreeResult> {
    return invoke<GitRemoveWorktreeResult>("remove_git_worktree", { request });
  }
}

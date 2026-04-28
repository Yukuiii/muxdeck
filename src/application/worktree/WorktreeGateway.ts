import type {
  GitCreateWorktreeRequest,
  GitCreateWorktreeResult,
  GitProjectInspectionRequest,
  GitProjectInspectionResult,
  GitRemoveWorktreeRequest,
  GitRemoveWorktreeResult,
} from "../../types/worktree";

/**
 * 定义前端应用层访问 Git worktree 能力的端口。
 */
export interface WorktreeGateway {
  inspectProject(
    request: GitProjectInspectionRequest,
  ): Promise<GitProjectInspectionResult>;
  createWorktree(
    request: GitCreateWorktreeRequest,
  ): Promise<GitCreateWorktreeResult>;
  removeWorktree(
    request: GitRemoveWorktreeRequest,
  ): Promise<GitRemoveWorktreeResult>;
}

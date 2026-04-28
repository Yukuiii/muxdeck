/**
 * 描述前端请求解析项目与 worktree 结构所需的参数。
 */
export interface GitProjectInspectionRequest {
  cwd: string;
}

/**
 * 描述单个 Git worktree 的静态信息。
 */
export interface GitWorktreeEntry {
  cwd: string;
  branch?: string;
  isMain: boolean;
}

/**
 * 描述指定目录所属项目的 Git/worktree 结构。
 */
export interface GitProjectInspectionResult {
  repoRoot: string;
  repoName: string;
  currentWorktreePath: string;
  isRepository: boolean;
  worktrees: GitWorktreeEntry[];
}

/**
 * 描述前端创建 linked worktree 所需的参数。
 */
export interface GitCreateWorktreeRequest {
  cwd: string;
  branch: string;
}

/**
 * 描述创建 linked worktree 后返回的 worktree 信息。
 */
export interface GitCreateWorktreeResult {
  worktree: GitWorktreeEntry;
}

/**
 * 描述前端删除 linked worktree 所需的参数。
 */
export interface GitRemoveWorktreeRequest {
  cwd: string;
  path: string;
}

/**
 * 描述删除 linked worktree 的结果。
 */
export interface GitRemoveWorktreeResult {
  removed: boolean;
}

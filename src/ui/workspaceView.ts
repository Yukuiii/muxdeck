import type { WorkspaceStore } from "../application/workspace/WorkspaceStore";
import type { Project, TerminalTab, Worktree } from "../domain/workspace";

/**
 * 描述 React 渲染所需的 workspace 快照。
 */
export interface WorkspaceViewState {
  isReady: boolean;
  projects: Project[];
  worktrees: Worktree[];
  tabs: TerminalTab[];
  activeProjectId?: string;
  activeWorktreeId?: string;
  activeTabId?: string;
}

/**
 * 表示尚未完成 store 加载时的空 workspace 状态。
 */
export const EMPTY_WORKSPACE_STATE: WorkspaceViewState = {
  isReady: false,
  projects: [],
  worktrees: [],
  tabs: [],
};

/**
 * 创建 React 可消费的不可变 workspace 状态快照。
 */
export function createWorkspaceViewState(
  workspace: WorkspaceStore,
): WorkspaceViewState {
  return {
    isReady: true,
    projects: workspace.getProjects().map((project) => ({
      ...project,
      worktreeIds: [...project.worktreeIds],
    })),
    worktrees: workspace.getWorktrees().map((worktree) => ({
      ...worktree,
      tabs: [...worktree.tabs],
    })),
    tabs: workspace.getTabs().map((tab) => ({ ...tab })),
    activeProjectId: workspace.getActiveProjectId(),
    activeWorktreeId: workspace.getActiveWorktreeId(),
    activeTabId: workspace.getActiveTabId(),
  };
}

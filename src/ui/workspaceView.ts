import type { Project, TerminalTab } from "../state/workspaceStore";
import type { WorkspaceStore } from "../state/workspaceStore";

/**
 * 描述 React 渲染所需的 workspace 快照。
 */
export interface WorkspaceViewState {
  isReady: boolean;
  projects: Project[];
  tabs: TerminalTab[];
  activeProjectId?: string;
  activeTabId?: string;
}

/**
 * 表示尚未完成 store 加载时的空 workspace 状态。
 */
export const EMPTY_WORKSPACE_STATE: WorkspaceViewState = {
  isReady: false,
  projects: [],
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
      tabs: [...project.tabs],
    })),
    tabs: workspace.getTabs().map((tab) => ({ ...tab })),
    activeProjectId: workspace.getActiveProjectId(),
    activeTabId: workspace.getActiveTabId(),
  };
}

/**
 * 描述终端标签页当前的运行状态。
 */
export type TerminalStatus = "starting" | "running" | "exited";

/**
 * 描述一个开发项目及其关联的终端标签页。
 */
export interface Project {
  id: string;
  title: string;
  cwd: string;
  tabs: string[];
  activeTabId?: string;
}

/**
 * 描述一个终端标签页及其后端会话信息。
 */
export interface TerminalTab {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  status: TerminalStatus;
}

/**
 * 描述可持久化的 workspace 状态快照。
 */
export interface WorkspaceSnapshot {
  version: 1;
  projects: Project[];
  tabs: TerminalTab[];
  activeProjectId?: string;
  activeTabId?: string;
}

/**
 * 判断未知值是否为合法项目快照。
 */
export function isValidProject(value: unknown): value is Project {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Project).id === "string" &&
      typeof (value as Project).title === "string" &&
      typeof (value as Project).cwd === "string" &&
      Array.isArray((value as Project).tabs),
  );
}

/**
 * 判断未知值是否为合法终端标签快照。
 */
export function isValidTerminalTab(value: unknown): value is TerminalTab {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as TerminalTab).id === "string" &&
      typeof (value as TerminalTab).projectId === "string" &&
      typeof (value as TerminalTab).title === "string" &&
      typeof (value as TerminalTab).cwd === "string",
  );
}

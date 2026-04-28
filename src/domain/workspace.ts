/**
 * 描述终端标签页当前的运行状态。
 */
export type TerminalStatus = "starting" | "running" | "exited";

/**
 * 描述一个仓库级项目及其关联的 worktree 集合。
 */
export interface Project {
  id: string;
  title: string;
  repoRoot: string;
  worktreeIds: string[];
  activeWorktreeId?: string;
}

/**
 * 描述项目下的一个具体 worktree 及其终端标签页。
 */
export interface Worktree {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  branch?: string;
  isMain: boolean;
  tabs: string[];
  activeTabId?: string;
}

/**
 * 描述一个终端标签页及其后端会话信息。
 */
export interface TerminalTab {
  id: string;
  worktreeId: string;
  title: string;
  cwd: string;
  status: TerminalStatus;
}

/**
 * 描述旧版持久化结构中的项目快照。
 */
export interface LegacyProjectSnapshot {
  id: string;
  title: string;
  cwd: string;
  tabs: string[];
  activeTabId?: string;
}

/**
 * 描述旧版持久化结构中的终端标签快照。
 */
export interface LegacyTerminalTabSnapshot {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  status?: TerminalStatus;
}

/**
 * 描述 v1 可持久化的 workspace 状态快照。
 */
export interface WorkspaceSnapshotV1 {
  version: 1;
  projects: LegacyProjectSnapshot[];
  tabs: LegacyTerminalTabSnapshot[];
  activeProjectId?: string;
  activeTabId?: string;
}

/**
 * 描述 v2 可持久化的 workspace 状态快照。
 */
export interface WorkspaceSnapshotV2 {
  version: 2;
  projects: Project[];
  worktrees: Worktree[];
  tabs: TerminalTab[];
  activeProjectId?: string;
  activeWorktreeId?: string;
  activeTabId?: string;
}

/**
 * 描述所有受支持的 workspace 快照版本。
 */
export type WorkspaceSnapshot = WorkspaceSnapshotV1 | WorkspaceSnapshotV2;

/**
 * 判断未知值是否为合法项目快照。
 */
export function isValidProject(value: unknown): value is Project {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Project).id === "string" &&
      typeof (value as Project).title === "string" &&
      typeof (value as Project).repoRoot === "string" &&
      Array.isArray((value as Project).worktreeIds),
  );
}

/**
 * 判断未知值是否为合法 worktree 快照。
 */
export function isValidWorktree(value: unknown): value is Worktree {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Worktree).id === "string" &&
      typeof (value as Worktree).projectId === "string" &&
      typeof (value as Worktree).title === "string" &&
      typeof (value as Worktree).cwd === "string" &&
      typeof (value as Worktree).isMain === "boolean" &&
      Array.isArray((value as Worktree).tabs),
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
      typeof (value as TerminalTab).worktreeId === "string" &&
      typeof (value as TerminalTab).title === "string" &&
      typeof (value as TerminalTab).cwd === "string",
  );
}

/**
 * 判断未知值是否为合法旧版项目快照。
 */
export function isValidLegacyProjectSnapshot(
  value: unknown,
): value is LegacyProjectSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as LegacyProjectSnapshot).id === "string" &&
      typeof (value as LegacyProjectSnapshot).title === "string" &&
      typeof (value as LegacyProjectSnapshot).cwd === "string" &&
      Array.isArray((value as LegacyProjectSnapshot).tabs),
  );
}

/**
 * 判断未知值是否为合法旧版终端标签快照。
 */
export function isValidLegacyTerminalTabSnapshot(
  value: unknown,
): value is LegacyTerminalTabSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as LegacyTerminalTabSnapshot).id === "string" &&
      typeof (value as LegacyTerminalTabSnapshot).projectId === "string" &&
      typeof (value as LegacyTerminalTabSnapshot).title === "string" &&
      typeof (value as LegacyTerminalTabSnapshot).cwd === "string",
  );
}

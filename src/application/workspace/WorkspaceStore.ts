import { projectNameFromPath, terminalTitleFromPath } from "../../domain/pathLabels";
import {
  isValidLegacyProjectSnapshot,
  isValidLegacyTerminalTabSnapshot,
  isValidProject,
  isValidTerminalTab,
  isValidWorktree,
  type Project,
  type TerminalStatus,
  type TerminalTab,
  type Worktree,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotV1,
  type WorkspaceSnapshotV2,
} from "../../domain/workspace";
import type { WorkspaceRepository } from "./WorkspaceRepository";

/**
 * 描述从外部 Git/目录状态同步到 store 的 worktree 数据。
 */
export interface WorkspaceSeedWorktree {
  cwd: string;
  branch?: string;
  isMain: boolean;
}

/**
 * 描述从外部 Git/目录状态同步到 store 的项目数据。
 */
export interface WorkspaceSeedProject {
  title: string;
  repoRoot: string;
  selectedWorktreeCwd: string;
  worktrees: WorkspaceSeedWorktree[];
}

/**
 * 管理可持久化的项目、worktree、终端标签和激活状态。
 */
export class WorkspaceStore {
  private readonly projects = new Map<string, Project>();
  private readonly worktrees = new Map<string, Worktree>();
  private readonly tabs = new Map<string, TerminalTab>();
  private persistQueue = Promise.resolve();
  private activeProjectId?: string;
  private activeWorktreeId?: string;
  private activeTabId?: string;

  /**
   * 创建 workspace store 并注入持久化仓储。
   */
  private constructor(private readonly repository: WorkspaceRepository) {}

  /**
   * 创建 workspace store 并恢复已保存状态。
   */
  static async create(repository: WorkspaceRepository): Promise<WorkspaceStore> {
    const workspace = new WorkspaceStore(repository);

    await workspace.restore();

    return workspace;
  }

  /**
   * 返回当前所有项目。
   */
  getProjects(): Project[] {
    return [...this.projects.values()];
  }

  /**
   * 返回当前所有 worktree。
   */
  getWorktrees(): Worktree[] {
    return [...this.worktrees.values()];
  }

  /**
   * 返回当前所有终端标签。
   */
  getTabs(): TerminalTab[] {
    return [...this.tabs.values()];
  }

  /**
   * 按 ID 查找项目。
   */
  getProject(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }

  /**
   * 按 ID 查找 worktree。
   */
  getWorktree(worktreeId: string): Worktree | undefined {
    return this.worktrees.get(worktreeId);
  }

  /**
   * 返回指定项目下的所有 worktree。
   */
  getProjectWorktrees(projectId: string): Worktree[] {
    const project = this.projects.get(projectId);

    if (!project) {
      return [];
    }

    return project.worktreeIds
      .map((worktreeId) => this.worktrees.get(worktreeId))
      .filter((worktree): worktree is Worktree => Boolean(worktree));
  }

  /**
   * 按 ID 查找终端标签。
   */
  getTab(sessionId: string): TerminalTab | undefined {
    return this.tabs.get(sessionId);
  }

  /**
   * 返回当前激活项目 ID。
   */
  getActiveProjectId(): string | undefined {
    return this.activeProjectId;
  }

  /**
   * 返回当前激活 worktree ID。
   */
  getActiveWorktreeId(): string | undefined {
    return this.activeWorktreeId;
  }

  /**
   * 返回当前激活终端标签 ID。
   */
  getActiveTabId(): string | undefined {
    return this.activeTabId;
  }

  /**
   * 按仓库根目录查找已添加的项目。
   */
  findProjectByRepoRoot(repoRoot: string): Project | undefined {
    for (const project of this.projects.values()) {
      if (project.repoRoot === repoRoot) {
        return project;
      }
    }

    return undefined;
  }

  /**
   * 按目录路径查找已添加的项目或其 worktree。
   */
  findProjectByCwd(cwd: string): Project | undefined {
    const worktree = this.findWorktreeByCwd(cwd);

    if (worktree) {
      return this.projects.get(worktree.projectId);
    }

    for (const project of this.projects.values()) {
      if (project.repoRoot === cwd) {
        return project;
      }
    }

    return undefined;
  }

  /**
   * 按目录路径查找指定 worktree。
   */
  findWorktreeByCwd(cwd: string): Worktree | undefined {
    for (const worktree of this.worktrees.values()) {
      if (worktree.cwd === cwd) {
        return worktree;
      }
    }

    return undefined;
  }

  /**
   * 创建或更新一个项目及其 worktree 集合，并将选中的 worktree 设为当前激活项。
   */
  upsertProject(seed: WorkspaceSeedProject): {
    project: Project;
    worktree: Worktree;
  } {
    const project =
      this.findProjectByRepoRoot(seed.repoRoot) ??
      this.createProjectRecord(seed.title, seed.repoRoot);
    let activeWorktree: Worktree | undefined;

    project.title = seed.title.trim() || projectNameFromPath(seed.repoRoot);
    project.repoRoot = seed.repoRoot;

    for (const worktreeSeed of sortWorktreeSeeds(seed.worktrees)) {
      const worktree = this.upsertWorktreeRecord(project, worktreeSeed);

      if (
        worktree.cwd === seed.selectedWorktreeCwd ||
        (!activeWorktree && worktree.isMain)
      ) {
        activeWorktree = worktree;
      }
    }

    this.sortProjectWorktreeIds(project);
    this.activateWorktree(
      activeWorktree?.id ??
        project.activeWorktreeId ??
        project.worktreeIds.at(0) ??
        "",
    );

    return {
      project,
      worktree:
        this.worktrees.get(this.activeWorktreeId ?? "") ??
        this.worktrees.get(project.worktreeIds[0] ?? "")!,
    };
  }

  /**
   * 向指定项目追加或更新一个 worktree，并把它设为项目当前 worktree。
   */
  upsertProjectWorktree(
    projectId: string,
    seed: WorkspaceSeedWorktree,
  ): Worktree | undefined {
    const project = this.projects.get(projectId);

    if (!project) {
      return undefined;
    }

    const worktree = this.upsertWorktreeRecord(project, seed);
    this.sortProjectWorktreeIds(project);
    this.activateWorktree(worktree.id);

    return worktree;
  }

  /**
   * 在指定 worktree 下创建终端标签。
   */
  createTerminalTab(worktreeId: string): TerminalTab | undefined {
    const worktree = this.worktrees.get(worktreeId);

    if (!worktree) {
      return undefined;
    }

    const sessionId = crypto.randomUUID();
    const tab: TerminalTab = {
      id: sessionId,
      worktreeId: worktree.id,
      title: terminalTitleFromPath(worktree.cwd),
      cwd: worktree.cwd,
      status: "starting",
    };

    worktree.tabs.push(sessionId);
    this.tabs.set(sessionId, tab);
    this.activateTerminalTab(sessionId);

    return tab;
  }

  /**
   * 将指定项目设为激活项目，并恢复其最近活动的 worktree 和终端。
   */
  activateProject(projectId: string): Project | undefined {
    const project = this.projects.get(projectId);

    if (!project) {
      return undefined;
    }

    this.activeProjectId = project.id;
    this.activeWorktreeId = this.resolveProjectActiveWorktreeId(project);
    this.activeTabId = this.resolveWorktreeActiveTabId(this.activeWorktreeId);
    this.persist();

    return project;
  }

  /**
   * 将指定 worktree 设为激活 worktree，并恢复其最近活动的终端。
   */
  activateWorktree(worktreeId: string): Worktree | undefined {
    const worktree = this.worktrees.get(worktreeId);
    const project = worktree ? this.projects.get(worktree.projectId) : undefined;

    if (!worktree || !project) {
      return undefined;
    }

    this.activeProjectId = project.id;
    this.activeWorktreeId = worktree.id;
    project.activeWorktreeId = worktree.id;
    this.activeTabId = this.resolveWorktreeActiveTabId(worktree.id);
    this.persist();

    return worktree;
  }

  /**
   * 将指定终端标签设为激活标签。
   */
  activateTerminalTab(sessionId: string): TerminalTab | undefined {
    const tab = this.tabs.get(sessionId);
    const worktree = tab ? this.worktrees.get(tab.worktreeId) : undefined;
    const project = worktree ? this.projects.get(worktree.projectId) : undefined;

    if (!tab || !worktree || !project) {
      return undefined;
    }

    this.activeProjectId = project.id;
    this.activeWorktreeId = worktree.id;
    this.activeTabId = tab.id;
    project.activeWorktreeId = worktree.id;
    worktree.activeTabId = tab.id;
    this.persist();

    return tab;
  }

  /**
   * 更新终端标签状态。
   */
  setTerminalStatus(sessionId: string, status: TerminalStatus): TerminalTab | undefined {
    const tab = this.tabs.get(sessionId);

    if (!tab) {
      return undefined;
    }

    tab.status = status;
    this.persist();

    return tab;
  }

  /**
   * 移除终端标签并返回同 worktree 下的下一个激活标签 ID。
   */
  removeTerminalTab(sessionId: string): string | undefined {
    const tab = this.tabs.get(sessionId);

    if (!tab) {
      return undefined;
    }

    const worktree = this.worktrees.get(tab.worktreeId);
    this.tabs.delete(sessionId);

    if (!worktree) {
      this.syncActiveSelection();
      this.persist();
      return undefined;
    }

    worktree.tabs = worktree.tabs.filter((id) => id !== sessionId);

    if (worktree.activeTabId === sessionId) {
      worktree.activeTabId = worktree.tabs.at(-1);
    }

    if (this.activeTabId === sessionId) {
      this.activeTabId = worktree.activeTabId;
    }

    this.syncActiveSelection();
    this.persist();

    return worktree.activeTabId;
  }

  /**
   * 仅从应用状态中移除指定 worktree 及其所有终端标签。
   */
  removeWorktree(worktreeId: string): void {
    const worktree = this.worktrees.get(worktreeId);

    if (!worktree) {
      return;
    }

    const project = this.projects.get(worktree.projectId);

    for (const tabId of worktree.tabs) {
      this.tabs.delete(tabId);
    }

    this.worktrees.delete(worktreeId);

    if (project) {
      project.worktreeIds = project.worktreeIds.filter((id) => id !== worktreeId);

      if (project.activeWorktreeId === worktreeId) {
        project.activeWorktreeId = project.worktreeIds.at(0);
      }

      if (project.worktreeIds.length === 0) {
        this.projects.delete(project.id);
      }
    }

    this.syncActiveSelection();
    this.persist();
  }

  /**
   * 移除项目及其所有 worktree 和终端标签。
   */
  removeProject(projectId: string): void {
    const project = this.projects.get(projectId);

    if (!project) {
      return;
    }

    for (const worktreeId of project.worktreeIds) {
      const worktree = this.worktrees.get(worktreeId);

      if (!worktree) {
        continue;
      }

      for (const tabId of worktree.tabs) {
        this.tabs.delete(tabId);
      }

      this.worktrees.delete(worktreeId);
    }

    this.projects.delete(projectId);
    this.syncActiveSelection();
    this.persist();
  }

  /**
   * 将内存中的 workspace 写入持久化仓储。
   */
  private persist(): void {
    const snapshot = this.createSnapshot();

    this.persistQueue = this.persistQueue
      .then(() => this.repository.saveSnapshot(snapshot))
      .catch((error) => {
        console.error("Failed to persist workspace", error);
      });
  }

  /**
   * 从持久化仓储恢复 workspace 状态。
   */
  private async restore(): Promise<void> {
    try {
      const snapshot = await this.repository.loadSnapshot();

      if (!snapshot) {
        return;
      }

      this.applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to restore workspace", error);
    }
  }

  /**
   * 创建可安全序列化的 workspace 快照。
   */
  private createSnapshot(): WorkspaceSnapshotV2 {
    return {
      version: 2,
      projects: this.getProjects().map((project) => ({
        ...project,
        worktreeIds: [...project.worktreeIds],
      })),
      worktrees: this.getWorktrees().map((worktree) => ({
        ...worktree,
        tabs: [...worktree.tabs],
      })),
      tabs: this.getTabs().map((tab) => ({ ...tab })),
      activeProjectId: this.activeProjectId,
      activeWorktreeId: this.activeWorktreeId,
      activeTabId: this.activeTabId,
    };
  }

  /**
   * 将已解析的快照规范化后写入内存状态。
   */
  private applySnapshot(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== "object") {
      return;
    }

    const version = (snapshot as WorkspaceSnapshot).version;

    if (version === 2) {
      this.applyV2Snapshot(snapshot as Partial<WorkspaceSnapshotV2>);
      return;
    }

    if (version === 1) {
      this.applyLegacySnapshot(snapshot as Partial<WorkspaceSnapshotV1>);
    }
  }

  /**
   * 将 v2 快照恢复为内存状态。
   */
  private applyV2Snapshot(snapshot: Partial<WorkspaceSnapshotV2>): void {
    this.clearState();

    const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
    const worktrees = Array.isArray(snapshot.worktrees) ? snapshot.worktrees : [];
    const tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];

    for (const project of projects) {
      if (!isValidProject(project)) {
        continue;
      }

      this.projects.set(project.id, {
        ...project,
        worktreeIds: [],
      });
    }

    for (const worktree of worktrees) {
      if (!isValidWorktree(worktree) || !this.projects.has(worktree.projectId)) {
        continue;
      }

      const restoredWorktree: Worktree = {
        ...worktree,
        tabs: [],
      };

      this.worktrees.set(restoredWorktree.id, restoredWorktree);
      this.projects.get(restoredWorktree.projectId)?.worktreeIds.push(restoredWorktree.id);
    }

    for (const tab of tabs) {
      if (!isValidTerminalTab(tab) || !this.worktrees.has(tab.worktreeId)) {
        continue;
      }

      const restoredTab: TerminalTab = {
        ...tab,
        status: "starting",
      };
      const worktree = this.worktrees.get(restoredTab.worktreeId);

      worktree?.tabs.push(restoredTab.id);
      this.tabs.set(restoredTab.id, restoredTab);
    }

    for (const project of this.projects.values()) {
      this.sortProjectWorktreeIds(project);
      project.activeWorktreeId = this.resolveProjectActiveWorktreeId(project);
    }

    for (const worktree of this.worktrees.values()) {
      worktree.activeTabId = this.resolveStoredActiveTabId(
        worktree.tabs,
        worktree.activeTabId,
      );
    }

    this.activeProjectId =
      snapshot.activeProjectId && this.projects.has(snapshot.activeProjectId)
        ? snapshot.activeProjectId
        : undefined;
    this.activeWorktreeId =
      snapshot.activeWorktreeId && this.worktrees.has(snapshot.activeWorktreeId)
        ? snapshot.activeWorktreeId
        : undefined;
    this.activeTabId =
      snapshot.activeTabId && this.tabs.has(snapshot.activeTabId)
        ? snapshot.activeTabId
        : undefined;
    this.syncActiveSelection();
  }

  /**
   * 将 v1 快照迁移为新的项目/worktree 结构。
   */
  private applyLegacySnapshot(snapshot: Partial<WorkspaceSnapshotV1>): void {
    this.clearState();

    const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
    const tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];
    const legacyWorktreeIds = new Map<string, string>();

    for (const legacyProject of projects) {
      if (!isValidLegacyProjectSnapshot(legacyProject)) {
        continue;
      }

      const project: Project = {
        id: legacyProject.id,
        title: legacyProject.title,
        repoRoot: legacyProject.cwd,
        worktreeIds: [],
      };
      const worktreeId = crypto.randomUUID();
      const worktree: Worktree = {
        id: worktreeId,
        projectId: project.id,
        title: "main",
        cwd: legacyProject.cwd,
        branch: undefined,
        isMain: true,
        tabs: [],
        activeTabId: legacyProject.activeTabId,
      };

      project.worktreeIds.push(worktree.id);
      project.activeWorktreeId = worktree.id;
      this.projects.set(project.id, project);
      this.worktrees.set(worktree.id, worktree);
      legacyWorktreeIds.set(project.id, worktree.id);
    }

    for (const legacyTab of tabs) {
      if (!isValidLegacyTerminalTabSnapshot(legacyTab)) {
        continue;
      }

      const worktreeId = legacyWorktreeIds.get(legacyTab.projectId);

      if (!worktreeId) {
        continue;
      }

      const restoredTab: TerminalTab = {
        id: legacyTab.id,
        worktreeId,
        title: legacyTab.title,
        cwd: legacyTab.cwd,
        status: "starting",
      };
      const worktree = this.worktrees.get(worktreeId);

      worktree?.tabs.push(restoredTab.id);
      this.tabs.set(restoredTab.id, restoredTab);
    }

    for (const worktree of this.worktrees.values()) {
      worktree.activeTabId = this.resolveStoredActiveTabId(
        worktree.tabs,
        worktree.activeTabId,
      );
    }

    this.activeProjectId =
      snapshot.activeProjectId && this.projects.has(snapshot.activeProjectId)
        ? snapshot.activeProjectId
        : undefined;
    this.activeTabId =
      snapshot.activeTabId && this.tabs.has(snapshot.activeTabId)
        ? snapshot.activeTabId
        : undefined;
    this.activeWorktreeId = this.activeProjectId
      ? this.projects.get(this.activeProjectId)?.activeWorktreeId
      : undefined;
    this.syncActiveSelection();
  }

  /**
   * 清空当前内存状态，供快照恢复前复用。
   */
  private clearState(): void {
    this.projects.clear();
    this.worktrees.clear();
    this.tabs.clear();
    this.activeProjectId = undefined;
    this.activeWorktreeId = undefined;
    this.activeTabId = undefined;
  }

  /**
   * 创建新的项目记录。
   */
  private createProjectRecord(title: string, repoRoot: string): Project {
    const project: Project = {
      id: crypto.randomUUID(),
      title: title.trim() || projectNameFromPath(repoRoot),
      repoRoot,
      worktreeIds: [],
    };

    this.projects.set(project.id, project);

    return project;
  }

  /**
   * 创建或更新一个 worktree 记录，并确保它挂在正确的项目下。
   */
  private upsertWorktreeRecord(
    project: Project,
    seed: WorkspaceSeedWorktree,
  ): Worktree {
    const normalizedBranch = normalizeBranch(seed.branch);
    const existingWorktree = this.findWorktreeByCwd(seed.cwd);
    const worktree =
      existingWorktree ??
      ({
        id: crypto.randomUUID(),
        projectId: project.id,
        title: "",
        cwd: seed.cwd,
        branch: normalizedBranch,
        isMain: seed.isMain,
        tabs: [],
      } satisfies Worktree);

    if (existingWorktree && existingWorktree.projectId !== project.id) {
      const previousProject = this.projects.get(existingWorktree.projectId);

      previousProject!.worktreeIds = previousProject!.worktreeIds.filter(
        (worktreeId) => worktreeId !== existingWorktree.id,
      );
    }

    worktree.projectId = project.id;
    worktree.cwd = seed.cwd;
    worktree.branch = normalizedBranch;
    worktree.isMain = seed.isMain;
    worktree.title = worktreeTitleFromSeed(seed);
    this.worktrees.set(worktree.id, worktree);

    if (!project.worktreeIds.includes(worktree.id)) {
      project.worktreeIds.push(worktree.id);
    }

    return worktree;
  }

  /**
   * 统一修正项目、worktree、终端标签之间的激活关系。
   */
  private syncActiveSelection(): void {
    const project =
      (this.activeProjectId
        ? this.projects.get(this.activeProjectId)
        : undefined) ??
      this.getProjects().at(0);

    this.activeProjectId = project?.id;

    if (!project) {
      this.activeWorktreeId = undefined;
      this.activeTabId = undefined;
      return;
    }

    const activeWorktreeId = this.resolveProjectActiveWorktreeId(project);
    const worktree = activeWorktreeId
      ? this.worktrees.get(activeWorktreeId)
      : undefined;

    project.activeWorktreeId = worktree?.id;
    this.activeWorktreeId = worktree?.id;

    if (!worktree) {
      this.activeTabId = undefined;
      return;
    }

    const activeTabId = this.resolveWorktreeActiveTabId(worktree.id);
    worktree.activeTabId = activeTabId;
    this.activeTabId = activeTabId;
  }

  /**
   * 解析项目当前应该指向的活动 worktree。
   */
  private resolveProjectActiveWorktreeId(project: Project): string | undefined {
    const storedWorktreeId =
      project.activeWorktreeId &&
      this.worktrees.get(project.activeWorktreeId)?.projectId === project.id
        ? project.activeWorktreeId
        : undefined;

    if (storedWorktreeId) {
      return storedWorktreeId;
    }

    const firstWorktreeId = project.worktreeIds.find((worktreeId) =>
      this.worktrees.has(worktreeId),
    );

    project.activeWorktreeId = firstWorktreeId;

    return firstWorktreeId;
  }

  /**
   * 解析 worktree 当前应该指向的活动终端标签。
   */
  private resolveWorktreeActiveTabId(worktreeId?: string): string | undefined {
    if (!worktreeId) {
      return undefined;
    }

    const worktree = this.worktrees.get(worktreeId);

    if (!worktree) {
      return undefined;
    }

    const nextActiveTabId = this.resolveStoredActiveTabId(
      worktree.tabs,
      worktree.activeTabId,
    );

    worktree.activeTabId = nextActiveTabId;

    return nextActiveTabId;
  }

  /**
   * 从给定标签集合中恢复一个仍然有效的活动标签 ID。
   */
  private resolveStoredActiveTabId(
    tabIds: string[],
    activeTabId?: string,
  ): string | undefined {
    if (activeTabId && this.tabs.has(activeTabId)) {
      return activeTabId;
    }

    return [...tabIds].reverse().find((tabId) => this.tabs.has(tabId));
  }

  /**
   * 按 main 优先和标题字典序稳定排序项目下的 worktree。
   */
  private sortProjectWorktreeIds(project: Project): void {
    project.worktreeIds = project.worktreeIds
      .filter((worktreeId) => this.worktrees.get(worktreeId)?.projectId === project.id)
      .sort((leftId, rightId) => {
        const left = this.worktrees.get(leftId);
        const right = this.worktrees.get(rightId);

        if (!left || !right) {
          return 0;
        }

        if (left.isMain !== right.isMain) {
          return left.isMain ? -1 : 1;
        }

        return left.title.localeCompare(right.title);
      });
  }
}

/**
 * 对 worktree 种子执行稳定排序，保证主工作区始终优先。
 */
function sortWorktreeSeeds(worktrees: WorkspaceSeedWorktree[]): WorkspaceSeedWorktree[] {
  return [...worktrees].sort((left, right) => {
    if (left.isMain !== right.isMain) {
      return left.isMain ? -1 : 1;
    }

    return worktreeTitleFromSeed(left).localeCompare(worktreeTitleFromSeed(right));
  });
}

/**
 * 生成用于侧边栏展示的 worktree 标题。
 */
function worktreeTitleFromSeed(seed: WorkspaceSeedWorktree): string {
  if (seed.isMain) {
    return "main";
  }

  return normalizeBranch(seed.branch) ?? projectNameFromPath(seed.cwd);
}

/**
 * 规范化可选分支名，避免把空白字符串写入快照。
 */
function normalizeBranch(branch?: string): string | undefined {
  const normalizedBranch = branch?.trim();

  return normalizedBranch ? normalizedBranch : undefined;
}

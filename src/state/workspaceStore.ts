import { load, type Store } from "@tauri-apps/plugin-store";
import { projectNameFromPath, terminalTitleFromPath } from "./pathLabels";

const WORKSPACE_STORE_PATH = "workspace.json";
const WORKSPACE_SNAPSHOT_KEY = "workspace";

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

interface WorkspaceSnapshot {
  version: 1;
  projects: Project[];
  tabs: TerminalTab[];
  activeProjectId?: string;
  activeTabId?: string;
}

/**
 * 管理可持久化的项目、终端标签和激活状态。
 */
export class WorkspaceStore {
  private readonly projects = new Map<string, Project>();
  private readonly tabs = new Map<string, TerminalTab>();
  private persistQueue = Promise.resolve();
  private activeProjectId?: string;
  private activeTabId?: string;

  /**
   * 创建 workspace store 并加载 Tauri 持久化文件。
   */
  private constructor(private readonly store: Store) {}

  /**
   * 加载 workspace store 并恢复已保存状态。
   */
  static async create(): Promise<WorkspaceStore> {
    const store = await load(WORKSPACE_STORE_PATH, {
      defaults: {},
      autoSave: false,
    });
    const workspace = new WorkspaceStore(store);

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
   * 返回当前激活终端标签 ID。
   */
  getActiveTabId(): string | undefined {
    return this.activeTabId;
  }

  /**
   * 按工作目录查找已添加的项目。
   */
  findProjectByCwd(cwd: string): Project | undefined {
    for (const project of this.projects.values()) {
      if (project.cwd === cwd) {
        return project;
      }
    }

    return undefined;
  }

  /**
   * 创建项目并将其设为当前激活项目。
   */
  createProject(cwd: string): Project {
    const project: Project = {
      id: crypto.randomUUID(),
      title: projectNameFromPath(cwd),
      cwd,
      tabs: [],
    };

    this.projects.set(project.id, project);
    this.activeProjectId = project.id;
    this.activeTabId = undefined;
    this.persist();

    return project;
  }

  /**
   * 在指定项目下创建终端标签。
   */
  createTerminalTab(projectId: string): TerminalTab | undefined {
    const project = this.projects.get(projectId);

    if (!project) {
      return undefined;
    }

    const sessionId = crypto.randomUUID();
    const tab: TerminalTab = {
      id: sessionId,
      projectId: project.id,
      title: terminalTitleFromPath(project.cwd),
      cwd: project.cwd,
      status: "starting",
    };

    project.tabs.push(sessionId);
    this.tabs.set(sessionId, tab);
    this.activateTerminalTab(sessionId);

    return tab;
  }

  /**
   * 将指定项目设为激活项目。
   */
  activateProject(projectId: string): Project | undefined {
    const project = this.projects.get(projectId);

    if (!project) {
      return undefined;
    }

    this.activeProjectId = project.id;
    this.activeTabId = project.activeTabId;
    this.persist();

    return project;
  }

  /**
   * 将指定终端标签设为激活标签。
   */
  activateTerminalTab(sessionId: string): TerminalTab | undefined {
    const tab = this.tabs.get(sessionId);
    const project = tab ? this.projects.get(tab.projectId) : undefined;

    if (!tab || !project) {
      return undefined;
    }

    this.activeProjectId = project.id;
    this.activeTabId = tab.id;
    project.activeTabId = tab.id;
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
   * 移除终端标签并返回同项目下的下一个激活标签 ID。
   */
  removeTerminalTab(sessionId: string): string | undefined {
    const tab = this.tabs.get(sessionId);

    if (!tab) {
      return undefined;
    }

    const project = this.projects.get(tab.projectId);
    this.tabs.delete(sessionId);

    if (!project) {
      this.persist();
      return undefined;
    }

    project.tabs = project.tabs.filter((id) => id !== sessionId);

    if (project.activeTabId === sessionId) {
      project.activeTabId = project.tabs.at(-1);
    }

    if (this.activeTabId === sessionId) {
      this.activeTabId = project.activeTabId;
    }

    this.persist();

    return project.activeTabId;
  }

  /**
   * 将内存中的 workspace 写入 Tauri Store。
   */
  private persist(): void {
    const snapshot = this.createSnapshot();

    this.persistQueue = this.persistQueue
      .then(async () => {
        await this.store.set(WORKSPACE_SNAPSHOT_KEY, snapshot);
        await this.store.save();
      })
      .catch((error) => {
        console.error("Failed to persist workspace", error);
      });
  }

  /**
   * 从 Tauri Store 恢复 workspace 状态。
   */
  private async restore(): Promise<void> {
    try {
      const snapshot = await this.store.get<Partial<WorkspaceSnapshot>>(
        WORKSPACE_SNAPSHOT_KEY,
      );

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
  private createSnapshot(): WorkspaceSnapshot {
    return {
      version: 1,
      projects: this.getProjects().map((project) => ({
        ...project,
        tabs: [...project.tabs],
      })),
      tabs: this.getTabs().map((tab) => ({ ...tab })),
      activeProjectId: this.activeProjectId,
      activeTabId: this.activeTabId,
    };
  }

  /**
   * 将已解析的快照规范化后写入内存状态。
   */
  private applySnapshot(snapshot: Partial<WorkspaceSnapshot>): void {
    if (snapshot.version !== 1) {
      return;
    }

    const projects = Array.isArray(snapshot.projects) ? snapshot.projects : [];
    const tabs = Array.isArray(snapshot.tabs) ? snapshot.tabs : [];

    for (const project of projects) {
      if (!isValidProject(project)) {
        continue;
      }

      this.projects.set(project.id, {
        ...project,
        tabs: [],
      });
    }

    for (const tab of tabs) {
      if (!isValidTerminalTab(tab) || !this.projects.has(tab.projectId)) {
        continue;
      }

      const restoredTab: TerminalTab = {
        ...tab,
        status: "starting",
      };
      const project = this.projects.get(restoredTab.projectId);

      project?.tabs.push(restoredTab.id);
      this.tabs.set(restoredTab.id, restoredTab);
    }

    for (const project of this.projects.values()) {
      if (!project.activeTabId || !this.tabs.has(project.activeTabId)) {
        project.activeTabId = project.tabs.at(-1);
      }
    }

    this.activeProjectId =
      snapshot.activeProjectId && this.projects.has(snapshot.activeProjectId)
        ? snapshot.activeProjectId
        : this.getProjects().at(0)?.id;
    this.activeTabId =
      snapshot.activeTabId && this.tabs.has(snapshot.activeTabId)
        ? snapshot.activeTabId
        : this.activeProjectId
          ? this.projects.get(this.activeProjectId)?.activeTabId
          : undefined;
  }
}

/**
 * 判断未知值是否为合法项目快照。
 */
function isValidProject(value: unknown): value is Project {
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
function isValidTerminalTab(value: unknown): value is TerminalTab {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as TerminalTab).id === "string" &&
      typeof (value as TerminalTab).projectId === "string" &&
      typeof (value as TerminalTab).title === "string" &&
      typeof (value as TerminalTab).cwd === "string",
  );
}

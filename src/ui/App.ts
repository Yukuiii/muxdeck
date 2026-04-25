import { open } from "@tauri-apps/plugin-dialog";
import { TerminalBridge } from "../terminal/TerminalBridge";
import {
  type TerminalSize,
  XtermRenderer,
} from "../terminal/XtermRenderer";
import type { TerminalExitPayload, TerminalOutputPayload } from "../types/terminal";

type TerminalStatus = "starting" | "running" | "exited";

interface Project {
  id: string;
  title: string;
  cwd: string;
  tabs: string[];
  activeTabId?: string;
  tabSequence: number;
}

interface ProjectView {
  project: Project;
  button: HTMLButtonElement;
}

interface TerminalTab {
  id: string;
  projectId: string;
  title: string;
  cwd: string;
  status: TerminalStatus;
}

interface TerminalTabView {
  tab: TerminalTab;
  button: HTMLButtonElement;
  surface: HTMLDivElement;
  renderer: XtermRenderer;
}

/**
 * 管理项目列表、终端标签页和 PTY 会话生命周期。
 */
export class AppController {
  private readonly bridge = new TerminalBridge();
  private readonly projects = new Map<string, ProjectView>();
  private readonly terminalTabs = new Map<string, TerminalTabView>();
  private readonly closingTerminalIds = new Set<string>();
  private projectList?: HTMLElement;
  private terminalPanel?: HTMLElement;
  private tabBar?: HTMLElement;
  private tabList?: HTMLElement;
  private terminalHost?: HTMLElement;
  private emptyState?: HTMLElement;
  private activeProjectId?: string;
  private activeTabId?: string;

  /**
   * 创建应用控制器并保存根节点引用。
   */
  constructor(private readonly root: HTMLElement) {}

  /**
   * 启动前端应用并进入未选择项目的初始状态。
   */
  async start(): Promise<void> {
    this.renderShell();
    await this.bridge.start(
      (payload) => this.handleTerminalOutput(payload),
      (payload) => this.handleTerminalExit(payload),
    );
  }

  /**
   * 渲染应用的基础布局容器。
   */
  private renderShell(): void {
    this.root.innerHTML = `
      <main class="app-shell">
        <aside class="sidebar">
          <nav class="project-list" aria-label="项目"></nav>
          <button class="add-project-button" type="button" data-action="add-project">
            <span class="add-project-icon">+</span>
            <span>Add Project</span>
          </button>
        </aside>
        <section class="terminal-panel">
          <div class="terminal-tabbar is-hidden">
            <nav class="terminal-tabs" aria-label="终端标签"></nav>
            <button class="terminal-tab-add" type="button" data-action="add-terminal-tab" title="新建终端标签">+</button>
          </div>
          <div class="terminal-host">
            <div class="empty-state">No project selected</div>
          </div>
        </section>
      </main>
    `;

    this.projectList =
      this.root.querySelector<HTMLElement>(".project-list") ?? undefined;
    this.terminalPanel =
      this.root.querySelector<HTMLElement>(".terminal-panel") ?? undefined;
    this.tabBar =
      this.root.querySelector<HTMLElement>(".terminal-tabbar") ?? undefined;
    this.tabList =
      this.root.querySelector<HTMLElement>(".terminal-tabs") ?? undefined;
    this.terminalHost =
      this.root.querySelector<HTMLElement>(".terminal-host") ?? undefined;
    this.emptyState = this.root.querySelector<HTMLElement>(".empty-state") ?? undefined;

    this.root
      .querySelector<HTMLButtonElement>("[data-action='add-project']")
      ?.addEventListener("click", () => {
        void this.addProject();
      });
    this.root
      .querySelector<HTMLButtonElement>("[data-action='add-terminal-tab']")
      ?.addEventListener("click", () => {
        void this.addTerminalTabToActiveProject();
      });
  }

  /**
   * 选择项目目录并创建对应项目工作区。
   */
  private async addProject(): Promise<void> {
    const selected = await open({
      canCreateDirectories: true,
      directory: true,
      multiple: false,
      title: "Add Project",
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    const existingProject = this.findProjectByCwd(selected);

    if (existingProject) {
      this.activateProject(existingProject.project.id);
      return;
    }

    await this.createProject(selected);
  }

  /**
   * 创建项目并初始化第一个终端标签页。
   */
  private async createProject(cwd: string): Promise<void> {
    const project: Project = {
      id: crypto.randomUUID(),
      title: projectNameFromPath(cwd),
      cwd,
      tabs: [],
      tabSequence: 0,
    };
    const button = this.createProjectButton(project);

    this.projectList?.append(button);
    this.projects.set(project.id, { project, button });
    this.activateProject(project.id);
    await this.createTerminalTab(project);
  }

  /**
   * 在当前项目中创建一个新的终端标签页。
   */
  private async addTerminalTabToActiveProject(): Promise<void> {
    if (!this.activeProjectId) {
      return;
    }

    const projectView = this.projects.get(this.activeProjectId);

    if (!projectView) {
      return;
    }

    await this.createTerminalTab(projectView.project);
  }

  /**
   * 创建一个终端标签页和对应后端 PTY 会话。
   */
  private async createTerminalTab(project: Project): Promise<void> {
    const sessionId = crypto.randomUUID();
    const tabIndex = ++project.tabSequence;
    const tab: TerminalTab = {
      id: sessionId,
      projectId: project.id,
      title: terminalTitleFromPath(project.cwd, tabIndex),
      cwd: project.cwd,
      status: "starting",
    };
    const button = this.createTerminalTabButton(tab);
    const surface = document.createElement("div");
    surface.className = "terminal-surface";
    surface.dataset.sessionId = sessionId;

    const renderer = new XtermRenderer(
      surface,
      (data) => {
        void this.bridge.writeInput({ sessionId, data });
      },
      (size) => {
        void this.resizeTerminalTab(sessionId, size);
      },
    );

    project.tabs.push(sessionId);
    this.tabList?.append(button);
    this.terminalHost?.append(surface);

    const initialSize = renderer.mount();
    this.terminalTabs.set(sessionId, { tab, button, surface, renderer });
    this.activateTerminalTab(sessionId);

    await this.bridge.createSession({
      sessionId,
      cwd: project.cwd,
      rows: initialSize.rows,
      cols: initialSize.cols,
    });

    tab.status = "running";
    this.updateTerminalTabButton(sessionId);
    renderer.focus();
  }

  /**
   * 创建项目侧边栏按钮。
   */
  private createProjectButton(project: Project): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-item";
    button.dataset.projectId = project.id;
    button.addEventListener("click", () => this.activateProject(project.id));
    this.writeProjectButton(button, project);
    return button;
  }

  /**
   * 创建终端标签页按钮。
   */
  private createTerminalTabButton(tab: TerminalTab): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "terminal-tab";
    button.dataset.sessionId = tab.id;
    button.addEventListener("click", () => this.activateTerminalTab(tab.id));
    this.writeTerminalTabButton(button, tab);
    return button;
  }

  /**
   * 激活指定项目并显示该项目的终端标签。
   */
  private activateProject(projectId: string): void {
    const projectView = this.projects.get(projectId);

    if (!projectView) {
      return;
    }

    this.activeProjectId = projectId;
    this.terminalPanel?.classList.add("has-active-workspace");
    this.tabBar?.classList.remove("is-hidden");
    this.emptyState?.classList.add("is-hidden");

    for (const [id, view] of this.projects) {
      view.button.classList.toggle("is-active", id === projectId);
    }

    for (const view of this.terminalTabs.values()) {
      view.button.classList.toggle("is-hidden", view.tab.projectId !== projectId);
      view.surface.classList.remove("is-active");
    }

    if (projectView.project.activeTabId) {
      this.activateTerminalTab(projectView.project.activeTabId);
      return;
    }

    this.activeTabId = undefined;
    this.showEmptyState("No terminal selected");
  }

  /**
   * 激活指定终端标签页并隐藏其它终端 surface。
   */
  private activateTerminalTab(sessionId: string): void {
    const view = this.terminalTabs.get(sessionId);

    if (!view) {
      return;
    }

    const projectView = this.projects.get(view.tab.projectId);

    if (!projectView) {
      return;
    }

    this.activeProjectId = view.tab.projectId;
    this.activeTabId = sessionId;
    projectView.project.activeTabId = sessionId;
    this.terminalPanel?.classList.add("has-active-workspace");
    this.tabBar?.classList.remove("is-hidden");
    this.emptyState?.classList.add("is-hidden");

    for (const [id, project] of this.projects) {
      project.button.classList.toggle("is-active", id === view.tab.projectId);
    }

    for (const [id, tabView] of this.terminalTabs) {
      const isSameProject = tabView.tab.projectId === view.tab.projectId;
      const isActive = id === sessionId;
      tabView.button.classList.toggle("is-hidden", !isSameProject);
      tabView.button.classList.toggle("is-active", isActive);
      tabView.surface.classList.toggle("is-active", isActive);
    }

    view.renderer.focus();
  }

  /**
   * 关闭指定终端标签页并释放对应 PTY 会话。
   */
  private closeTerminalTab(sessionId: string): void {
    if (this.closingTerminalIds.has(sessionId)) {
      return;
    }

    const view = this.terminalTabs.get(sessionId);

    if (!view) {
      return;
    }

    this.closingTerminalIds.add(sessionId);
    const projectView = this.projects.get(view.tab.projectId);

    this.terminalTabs.delete(sessionId);
    view.button.remove();
    view.surface.remove();

    try {
      view.renderer.dispose();
    } catch (error) {
      console.error("Failed to dispose terminal renderer", error);
    }

    this.closeTerminalSession(sessionId);

    if (!projectView) {
      return;
    }

    projectView.project.tabs = projectView.project.tabs.filter((id) => id !== sessionId);

    if (projectView.project.activeTabId === sessionId) {
      projectView.project.activeTabId = projectView.project.tabs.at(-1);
    }

    if (this.activeTabId === sessionId) {
      this.activeTabId = projectView.project.activeTabId;
    }

    if (projectView.project.activeTabId) {
      this.activateTerminalTab(projectView.project.activeTabId);
      return;
    }

    this.showEmptyState("No terminal selected");
  }

  /**
   * 按 sessionId 将后端输出分发到对应终端渲染器。
   */
  private handleTerminalOutput(payload: TerminalOutputPayload): void {
    const view = this.terminalTabs.get(payload.sessionId);
    view?.renderer.write(new Uint8Array(payload.data));
  }

  /**
   * 标记终端会话退出并更新标签状态。
   */
  private handleTerminalExit(payload: TerminalExitPayload): void {
    if (this.closingTerminalIds.has(payload.sessionId)) {
      return;
    }

    const view = this.terminalTabs.get(payload.sessionId);

    if (!view) {
      return;
    }

    view.tab.status = "exited";
    this.updateTerminalTabButton(payload.sessionId);
  }

  /**
   * 同步指定终端标签页的 PTY 行列尺寸。
   */
  private async resizeTerminalTab(
    sessionId: string,
    size: TerminalSize,
  ): Promise<void> {
    if (!this.terminalTabs.has(sessionId)) {
      return;
    }

    await this.bridge.resize({
      sessionId,
      rows: size.rows,
      cols: size.cols,
    });
  }

  /**
   * 刷新指定终端标签按钮展示内容。
   */
  private updateTerminalTabButton(sessionId: string): void {
    const view = this.terminalTabs.get(sessionId);

    if (!view) {
      return;
    }

    this.writeTerminalTabButton(view.button, view.tab);
  }

  /**
   * 将项目展示信息写入侧边栏按钮 DOM。
   */
  private writeProjectButton(button: HTMLButtonElement, project: Project): void {
    button.innerHTML = `
      <span class="project-icon">${project.title.slice(0, 1).toUpperCase()}</span>
      <span class="project-copy">
        <span class="project-title">${project.title}</span>
        <span class="project-meta">primary</span>
      </span>
      <span class="project-chevron">›</span>
    `;
  }

  /**
   * 将终端标签展示信息写入按钮 DOM。
   */
  private writeTerminalTabButton(
    button: HTMLButtonElement,
    tab: TerminalTab,
  ): void {
    const statusClass = tab.status === "exited" ? " is-exited" : "";
    button.innerHTML = `
      <span class="terminal-tab-icon">▻</span>
      <span class="terminal-tab-title">${tab.title}</span>
      <span class="terminal-tab-status${statusClass}"></span>
      <span class="terminal-tab-close" title="关闭标签">×</span>
    `;
    const closeControl =
      button.querySelector<HTMLElement>(".terminal-tab-close");

    closeControl?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeTerminalTab(tab.id);
    });
    closeControl?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeTerminalTab(tab.id);
    });
  }

  /**
   * 异步关闭后端 PTY 会话并清理关闭锁。
   */
  private closeTerminalSession(sessionId: string): void {
    void this.bridge
      .closeSession(sessionId)
      .catch((error) => {
        console.error("Failed to close terminal session", error);
      })
      .finally(() => {
        this.closingTerminalIds.delete(sessionId);
      });
  }

  /**
   * 显示终端区域空状态提示。
   */
  private showEmptyState(message: string): void {
    this.emptyState?.classList.remove("is-hidden");

    if (this.emptyState) {
      this.emptyState.textContent = message;
    }

    for (const view of this.terminalTabs.values()) {
      view.surface.classList.remove("is-active");
      view.button.classList.remove("is-active");
    }
  }

  /**
   * 按工作目录查找已添加的项目。
   */
  private findProjectByCwd(cwd: string): ProjectView | undefined {
    for (const view of this.projects.values()) {
      if (view.project.cwd === cwd) {
        return view;
      }
    }

    return undefined;
  }
}

/**
 * 从目录路径提取用于侧边栏展示的项目名。
 */
function projectNameFromPath(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/);

  return parts.at(-1) || path;
}

/**
 * 从目录路径生成终端标签标题。
 */
function terminalTitleFromPath(path: string, index: number): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/).filter(Boolean);
  const suffix = index > 1 ? ` ${index}` : "";

  if (parts.length <= 2) {
    return `${normalizedPath}/${suffix}`.trim();
  }

  return `.../${parts.slice(-2).join("/")}/${suffix}`.trim();
}

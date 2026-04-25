import { open } from "@tauri-apps/plugin-dialog";
import { WorkspaceStore } from "../state/workspaceStore";
import { TerminalBridge } from "../terminal/TerminalBridge";
import {
  type TerminalSize,
  XtermRenderer,
} from "../terminal/XtermRenderer";
import type { TerminalExitPayload, TerminalOutputPayload } from "../types/terminal";
import type { Project, ProjectView, TerminalTab, TerminalTabView } from "./models";
import { writeProjectButton, writeTerminalTabButton } from "./renderers";

/**
 * 管理项目列表、终端标签页和 PTY 会话生命周期。
 */
export class AppController {
  private readonly bridge = new TerminalBridge();
  private readonly projectViews = new Map<string, ProjectView>();
  private readonly terminalTabs = new Map<string, TerminalTabView>();
  private readonly closingTerminalIds = new Set<string>();
  private workspace!: WorkspaceStore;
  private projectList?: HTMLElement;
  private terminalPanel?: HTMLElement;
  private tabBar?: HTMLElement;
  private tabList?: HTMLElement;
  private terminalHost?: HTMLElement;
  private emptyState?: HTMLElement;

  /**
   * 创建应用控制器并保存根节点引用。
   */
  constructor(private readonly root: HTMLElement) {}

  /**
   * 启动前端应用并进入未选择项目的初始状态。
   */
  async start(): Promise<void> {
    this.workspace = await WorkspaceStore.create();
    this.renderShell();
    await this.bridge.start(
      (payload) => this.handleTerminalOutput(payload),
      (payload) => this.handleTerminalExit(payload),
    );
    await this.restoreWorkspace();
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

    const existingProject = this.workspace.findProjectByCwd(selected);

    if (existingProject) {
      this.activateProject(existingProject.id);
      return;
    }

    await this.createProject(selected);
  }

  /**
   * 创建项目并初始化第一个终端标签页。
   */
  private async createProject(cwd: string): Promise<void> {
    const project = this.workspace.createProject(cwd);

    this.addProjectView(project);
    this.activateProject(project.id);
    await this.createTerminalTab(project);
  }

  /**
   * 在当前项目中创建一个新的终端标签页。
   */
  private async addTerminalTabToActiveProject(): Promise<void> {
    const activeProjectId = this.workspace.getActiveProjectId();

    if (!activeProjectId) {
      return;
    }

    const project = this.workspace.getProject(activeProjectId);

    if (!project) {
      return;
    }

    await this.createTerminalTab(project);
  }

  /**
   * 创建一个终端标签页和对应后端 PTY 会话。
   */
  private async createTerminalTab(project: Project): Promise<void> {
    const tab = this.workspace.createTerminalTab(project.id);

    if (!tab) {
      return;
    }

    await this.createTerminalTabView(tab);
  }

  /**
   * 创建终端标签页视图并启动对应后端 PTY 会话。
   */
  private async createTerminalTabView(tab: TerminalTab): Promise<void> {
    const sessionId = tab.id;
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

    this.tabList?.append(button);
    this.terminalHost?.append(surface);

    this.terminalTabs.set(sessionId, { tab, button, surface, renderer });
    this.activateTerminalTab(sessionId);
    await waitForLayoutFrame();

    const initialSize = renderer.mount();

    await this.bridge.createSession({
      sessionId,
      cwd: tab.cwd,
      rows: initialSize.rows,
      cols: initialSize.cols,
    });

    this.workspace.setTerminalStatus(sessionId, "running");
    this.updateTerminalTabButton(sessionId);
    renderer.fit();
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
    writeProjectButton(button, project);
    return button;
  }

  /**
   * 将项目按钮加入侧边栏视图集合。
   */
  private addProjectView(project: Project): ProjectView {
    const button = this.createProjectButton(project);
    const projectView = { project, button };

    this.projectList?.append(button);
    this.projectViews.set(project.id, projectView);

    return projectView;
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
    writeTerminalTabButton(button, tab, (sessionId) => {
      this.closeTerminalTab(sessionId);
    });
    return button;
  }

  /**
   * 激活指定项目并显示该项目的终端标签。
   */
  private activateProject(projectId: string): void {
    const project = this.workspace.activateProject(projectId);
    const projectView = this.projectViews.get(projectId);

    if (!project || !projectView) {
      return;
    }

    this.terminalPanel?.classList.add("has-active-workspace");
    this.tabBar?.classList.remove("is-hidden");
    this.emptyState?.classList.add("is-hidden");

    for (const [id, view] of this.projectViews) {
      view.button.classList.toggle("is-active", id === projectId);
    }

    for (const view of this.terminalTabs.values()) {
      view.button.classList.toggle("is-hidden", view.tab.projectId !== projectId);
      view.surface.classList.remove("is-active");
    }

    if (project.activeTabId) {
      this.activateTerminalTab(project.activeTabId);
      return;
    }

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

    const tab = this.workspace.activateTerminalTab(sessionId);
    const projectView = this.projectViews.get(view.tab.projectId);

    if (!tab || !projectView) {
      return;
    }

    this.terminalPanel?.classList.add("has-active-workspace");
    this.tabBar?.classList.remove("is-hidden");
    this.emptyState?.classList.add("is-hidden");

    for (const [id, project] of this.projectViews) {
      project.button.classList.toggle("is-active", id === view.tab.projectId);
    }

    for (const [id, tabView] of this.terminalTabs) {
      const isSameProject = tabView.tab.projectId === view.tab.projectId;
      const isActive = id === sessionId;
      tabView.button.classList.toggle("is-hidden", !isSameProject);
      tabView.button.classList.toggle("is-active", isActive);
      tabView.surface.classList.toggle("is-active", isActive);
    }

    view.renderer.fit();
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
    const nextActiveTabId = this.workspace.removeTerminalTab(sessionId);

    this.terminalTabs.delete(sessionId);
    view.button.remove();
    view.surface.remove();

    try {
      view.renderer.dispose();
    } catch (error) {
      console.error("Failed to dispose terminal renderer", error);
    }

    this.closeTerminalSession(sessionId);

    if (nextActiveTabId) {
      this.activateTerminalTab(nextActiveTabId);
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

    this.workspace.setTerminalStatus(payload.sessionId, "exited");
    this.updateTerminalTabButton(payload.sessionId);
  }

  /**
   * 同步指定终端标签页的 PTY 行列尺寸。
   */
  private async resizeTerminalTab(
    sessionId: string,
    size: TerminalSize,
  ): Promise<void> {
    const view = this.terminalTabs.get(sessionId);

    if (!view || view.tab.status !== "running") {
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

    writeTerminalTabButton(view.button, view.tab, (sessionId) => {
      this.closeTerminalTab(sessionId);
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
   * 恢复持久化的项目和终端标签视图。
   */
  private async restoreWorkspace(): Promise<void> {
    const projects = this.workspace.getProjects();
    const restoredActiveProjectId = this.workspace.getActiveProjectId();
    const restoredActiveTabId = this.workspace.getActiveTabId();

    if (projects.length === 0) {
      return;
    }

    for (const project of projects) {
      this.addProjectView(project);
    }

    for (const tab of this.workspace.getTabs()) {
      await this.createTerminalTabView(tab);
    }

    if (restoredActiveTabId && this.terminalTabs.has(restoredActiveTabId)) {
      this.activateTerminalTab(restoredActiveTabId);
      return;
    }

    if (restoredActiveProjectId) {
      this.activateProject(restoredActiveProjectId);
    }
  }
}

/**
 * 等待浏览器完成一次布局，确保终端在可见容器中计算尺寸。
 */
function waitForLayoutFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

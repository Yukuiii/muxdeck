import { open } from "@tauri-apps/plugin-dialog";
import { TerminalBridge } from "../terminal/TerminalBridge";
import {
  type TerminalSize,
  XtermRenderer,
} from "../terminal/XtermRenderer";
import type { TerminalExitPayload, TerminalOutputPayload } from "../types/terminal";

interface Workspace {
  id: string;
  title: string;
  cwd?: string;
  status: "starting" | "running" | "exited";
}

interface WorkspaceView {
  workspace: Workspace;
  button: HTMLButtonElement;
  surface: HTMLDivElement;
  renderer: XtermRenderer;
}

export class AppController {
  private readonly bridge = new TerminalBridge();
  private readonly workspaces = new Map<string, WorkspaceView>();
  private sidebar?: HTMLElement;
  private terminalPanel?: HTMLElement;
  private terminalHost?: HTMLElement;
  private emptyState?: HTMLElement;
  private toolbar?: HTMLElement;
  private activeWorkspaceId?: string;

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
          <button class="add-project-button" type="button" data-action="add-project">
            <span class="add-project-icon">+</span>
            <span>Add Project</span>
          </button>
          <nav class="workspace-list" aria-label="工作区"></nav>
        </aside>
        <section class="terminal-panel">
          <div class="terminal-toolbar is-hidden">
            <span class="status-dot"></span>
            <span class="active-title">Terminal</span>
          </div>
          <div class="terminal-host">
            <div class="empty-state">No project selected</div>
          </div>
        </section>
      </main>
    `;

    this.sidebar = this.root.querySelector<HTMLElement>(".workspace-list") ?? undefined;
    this.terminalPanel =
      this.root.querySelector<HTMLElement>(".terminal-panel") ?? undefined;
    this.terminalHost =
      this.root.querySelector<HTMLElement>(".terminal-host") ?? undefined;
    this.emptyState = this.root.querySelector<HTMLElement>(".empty-state") ?? undefined;
    this.toolbar =
      this.root.querySelector<HTMLElement>(".terminal-toolbar") ?? undefined;

    this.root
      .querySelector<HTMLButtonElement>("[data-action='add-project']")
      ?.addEventListener("click", () => {
        void this.addProject();
      });
  }

  /**
   * 选择项目目录并创建对应终端工作区。
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

    const existingWorkspace = this.findWorkspaceByCwd(selected);

    if (existingWorkspace) {
      this.activateWorkspace(existingWorkspace.workspace.id);
      return;
    }

    await this.createWorkspace(selected);
  }

  /**
   * 创建一个项目工作区和对应后端 PTY 会话。
   */
  private async createWorkspace(cwd: string): Promise<void> {
    const sessionId = crypto.randomUUID();
    const workspace: Workspace = {
      id: sessionId,
      title: projectNameFromPath(cwd),
      cwd,
      status: "starting",
    };

    const button = this.createWorkspaceButton(workspace);
    const surface = document.createElement("div");
    surface.className = "terminal-surface";
    surface.dataset.sessionId = sessionId;

    const renderer = new XtermRenderer(
      surface,
      (data) => {
        void this.bridge.writeInput({ sessionId, data });
      },
      (size) => {
        void this.resizeWorkspace(sessionId, size);
      },
    );

    this.sidebar?.append(button);
    this.terminalHost?.append(surface);

    const initialSize = renderer.mount();
    this.workspaces.set(sessionId, { workspace, button, surface, renderer });
    this.activateWorkspace(sessionId);

    const session = await this.bridge.createSession({
      sessionId,
      cwd,
      rows: initialSize.rows,
      cols: initialSize.cols,
    });

    workspace.cwd = session.cwd;
    workspace.status = "running";
    this.updateWorkspaceButton(sessionId);
    renderer.focus();
  }

  /**
   * 创建工作区侧边栏按钮。
   */
  private createWorkspaceButton(workspace: Workspace): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-item";
    button.dataset.sessionId = workspace.id;
    button.addEventListener("click", () => this.activateWorkspace(workspace.id));
    this.writeWorkspaceButton(button, workspace);
    return button;
  }

  /**
   * 激活指定工作区并隐藏其它终端 surface。
   */
  private activateWorkspace(sessionId: string): void {
    this.activeWorkspaceId = sessionId;
    this.terminalPanel?.classList.add("has-active-workspace");
    this.emptyState?.classList.add("is-hidden");
    this.toolbar?.classList.remove("is-hidden");

    for (const [id, view] of this.workspaces) {
      const isActive = id === sessionId;
      view.button.classList.toggle("is-active", isActive);
      view.surface.classList.toggle("is-active", isActive);
    }

    const view = this.workspaces.get(sessionId);
    const title = this.root.querySelector<HTMLElement>(".active-title");
    if (title && view) {
      title.textContent = view.workspace.title;
    }

    view?.renderer.focus();
  }

  /**
   * 按 sessionId 将后端输出分发到对应终端渲染器。
   */
  private handleTerminalOutput(payload: TerminalOutputPayload): void {
    const view = this.workspaces.get(payload.sessionId);
    view?.renderer.write(new Uint8Array(payload.data));
  }

  /**
   * 标记终端会话退出并更新侧边栏状态。
   */
  private handleTerminalExit(payload: TerminalExitPayload): void {
    const view = this.workspaces.get(payload.sessionId);

    if (!view) {
      return;
    }

    view.workspace.status = "exited";
    this.updateWorkspaceButton(payload.sessionId);
  }

  /**
   * 同步指定工作区的终端尺寸。
   */
  private async resizeWorkspace(
    sessionId: string,
    size: TerminalSize,
  ): Promise<void> {
    if (!this.workspaces.has(sessionId)) {
      return;
    }

    await this.bridge.resize({
      sessionId,
      rows: size.rows,
      cols: size.cols,
    });
  }

  /**
   * 根据当前工作区状态刷新侧边栏按钮。
   */
  private updateWorkspaceButton(sessionId: string): void {
    const view = this.workspaces.get(sessionId);

    if (!view) {
      return;
    }

    this.writeWorkspaceButton(view.button, view.workspace);
  }

  /**
   * 将工作区展示信息写入按钮 DOM。
   */
  private writeWorkspaceButton(
    button: HTMLButtonElement,
    workspace: Workspace,
  ): void {
    button.innerHTML = `
      <span class="workspace-title">${workspace.title}</span>
      <span class="workspace-meta">${workspace.cwd ?? workspace.status}</span>
    `;
  }

  /**
   * 按工作目录查找已添加的工作区。
   */
  private findWorkspaceByCwd(cwd: string): WorkspaceView | undefined {
    for (const view of this.workspaces.values()) {
      if (view.workspace.cwd === cwd) {
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

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
  private terminalHost?: HTMLElement;
  private activeWorkspaceId?: string;
  private workspaceIndex = 0;

  /**
   * 创建应用控制器并保存根节点引用。
   */
  constructor(private readonly root: HTMLElement) {}

  /**
   * 启动前端应用并创建默认终端工作区。
   */
  async start(): Promise<void> {
    this.renderShell();
    await this.bridge.start(
      (payload) => this.handleTerminalOutput(payload),
      (payload) => this.handleTerminalExit(payload),
    );
    await this.createWorkspace();
  }

  /**
   * 渲染应用的基础布局容器。
   */
  private renderShell(): void {
    this.root.innerHTML = `
      <main class="app-shell">
        <aside class="sidebar">
          <div class="sidebar-header">
            <div>
              <div class="app-title">Muxdeck</div>
              <div class="app-subtitle">workspace terminal</div>
            </div>
            <button class="icon-button" type="button" data-action="new-workspace" title="新建工作区">+</button>
          </div>
          <nav class="workspace-list" aria-label="工作区"></nav>
        </aside>
        <section class="terminal-panel">
          <div class="terminal-toolbar">
            <span class="status-dot"></span>
            <span class="active-title">Terminal</span>
          </div>
          <div class="terminal-host"></div>
        </section>
      </main>
    `;

    this.sidebar = this.root.querySelector<HTMLElement>(".workspace-list") ?? undefined;
    this.terminalHost =
      this.root.querySelector<HTMLElement>(".terminal-host") ?? undefined;

    this.root
      .querySelector<HTMLButtonElement>("[data-action='new-workspace']")
      ?.addEventListener("click", () => {
        void this.createWorkspace();
      });
  }

  /**
   * 创建一个前端工作区和对应后端 PTY 会话。
   */
  private async createWorkspace(): Promise<void> {
    const sessionId = crypto.randomUUID();
    const workspace: Workspace = {
      id: sessionId,
      title: `Shell ${++this.workspaceIndex}`,
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
      cwd: workspace.cwd,
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
      <span class="workspace-meta">${workspace.status}</span>
    `;
  }
}

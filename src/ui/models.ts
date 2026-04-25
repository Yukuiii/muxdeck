import type { XtermRenderer } from "../terminal/XtermRenderer";
export type { Project, TerminalTab } from "../state/workspaceStore";
import type { Project, TerminalTab } from "../state/workspaceStore";

/**
 * 绑定项目数据和侧边栏按钮节点。
 */
export interface ProjectView {
  project: Project;
  button: HTMLButtonElement;
}

/**
 * 绑定终端标签数据、DOM 节点和 xterm 渲染器。
 */
export interface TerminalTabView {
  tab: TerminalTab;
  button: HTMLButtonElement;
  surface: HTMLDivElement;
  renderer: XtermRenderer;
}

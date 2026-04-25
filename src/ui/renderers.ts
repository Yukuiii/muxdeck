import type { Project, TerminalTab } from "./models";

/**
 * 接收终端标签关闭请求的回调。
 */
export type TerminalTabCloseHandler = (sessionId: string) => void;

/**
 * 将项目展示信息写入侧边栏按钮 DOM。
 */
export function writeProjectButton(
  button: HTMLButtonElement,
  project: Project,
): void {
  const icon = createSpanElement(
    "project-icon",
    project.title.slice(0, 1).toUpperCase(),
  );
  const copy = createSpanElement("project-copy");
  const title = createSpanElement("project-title", project.title);
  const meta = createSpanElement("project-meta", "primary");
  const chevron = createSpanElement("project-chevron", "›");

  copy.replaceChildren(title, meta);
  button.replaceChildren(icon, copy, chevron);
}

/**
 * 将终端标签展示信息写入按钮 DOM 并绑定关闭事件。
 */
export function writeTerminalTabButton(
  button: HTMLButtonElement,
  tab: TerminalTab,
  onClose: TerminalTabCloseHandler,
): void {
  const icon = createSpanElement("terminal-tab-icon", "▻");
  const title = createSpanElement("terminal-tab-title", tab.title);
  const status = createSpanElement("terminal-tab-status");
  const closeControl = createSpanElement("terminal-tab-close", "×");

  if (tab.status === "exited") {
    status.classList.add("is-exited");
  }

  closeControl.title = "关闭标签";
  button.replaceChildren(icon, title, status, closeControl);

  closeControl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose(tab.id);
  });
  closeControl.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose(tab.id);
  });
}

/**
 * 创建带 class 和可选文本内容的 span 元素。
 */
function createSpanElement(className: string, textContent = ""): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = textContent;

  return element;
}

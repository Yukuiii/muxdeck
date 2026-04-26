import { GitBranch, PanelRightClose, Plus, SquareTerminal, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import type { TerminalTab } from "../../domain/workspace";
import { useGitPanel } from "../hooks/useGitPanel";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { GitSidebar } from "./GitSidebar";

/**
 * 描述终端面板组件的输入属性。
 */
export interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeProjectId?: string;
  activeTabId?: string;
  activeProjectCwd?: string;
  onAddTerminalTab(): void;
  onActivateTerminalTab(sessionId: string): void;
  onCloseTerminalTab(sessionId: string): void;
  onSurfaceRef(sessionId: string, element: HTMLDivElement | null): void;
}

/**
 * 渲染终端标签栏、xterm 容器和空状态。
 */
export function TerminalPanel({
  tabs,
  activeProjectId,
  activeTabId,
  activeProjectCwd,
  onAddTerminalTab,
  onActivateTerminalTab,
  onCloseTerminalTab,
  onSurfaceRef,
}: TerminalPanelProps): ReactElement {
  const [isGitSidebarOpen, setIsGitSidebarOpen] = useState(false);
  const gitSidebarWidth = useResizableWidth({
    defaultWidth: 320,
    minWidth: 260,
    maxWidth: 520,
    edge: "left",
  });
  const activeProjectTabs = useMemo(
    () => tabs.filter((tab) => tab.projectId === activeProjectId),
    [activeProjectId, tabs],
  );
  const gitPanel = useGitPanel(activeProjectCwd, isGitSidebarOpen);
  const emptyStateText = activeProjectId
    ? "No terminal selected"
    : "No project selected";
  const hasActiveWorkspace = Boolean(activeProjectId);
  const hasActiveTerminal = Boolean(activeProjectId && activeTabId);
  const terminalBodyStyle = {
    "--git-sidebar-width": `${gitSidebarWidth.width}px`,
  } as CSSProperties;

  /**
   * 没有活动项目时关闭 Git 侧栏。
   */
  useEffect(() => {
    if (!activeProjectCwd) {
      setIsGitSidebarOpen(false);
    }
  }, [activeProjectCwd]);

  return (
    <section
      className={`terminal-panel${hasActiveWorkspace ? " has-active-workspace" : ""}`}
    >
      <div className={`terminal-tabbar${hasActiveWorkspace ? "" : " is-hidden"}`}>
        <nav className="terminal-tabs" aria-label="终端标签">
          {activeProjectTabs.map((tab) => (
            <TerminalTabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onActivate={onActivateTerminalTab}
              onClose={onCloseTerminalTab}
            />
          ))}
        </nav>
        <button
          className="terminal-tab-add"
          type="button"
          title="新建终端标签"
          onClick={onAddTerminalTab}
        >
          <Plus aria-hidden="true" size={15} strokeWidth={2.4} />
        </button>
        <button
          className={`terminal-tab-action${isGitSidebarOpen ? " is-active" : ""}`}
          type="button"
          title="显示 Git 面板"
          disabled={!activeProjectCwd}
          onClick={() => setIsGitSidebarOpen((isOpen) => !isOpen)}
        >
          {isGitSidebarOpen ? (
            <PanelRightClose aria-hidden="true" size={15} strokeWidth={2} />
          ) : (
            <GitBranch aria-hidden="true" size={15} strokeWidth={2} />
          )}
        </button>
      </div>

      <div
        className={`terminal-body${isGitSidebarOpen ? " has-git-sidebar" : ""}`}
        style={terminalBodyStyle}
      >
        <div className="terminal-host">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              ref={(element) => onSurfaceRef(tab.id, element)}
              className={`terminal-surface${tab.id === activeTabId ? " is-active" : ""}`}
              data-session-id={tab.id}
            />
          ))}
          <div className={`empty-state${hasActiveTerminal ? " is-hidden" : ""}`}>
            {emptyStateText}
          </div>
        </div>
        {isGitSidebarOpen ? (
          <div className="git-sidebar-shell">
            <div
              className="git-sidebar-resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整 Git 面板宽度"
              onPointerDown={(event) => gitSidebarWidth.startResize(event)}
            />
            <GitSidebar
              data={gitPanel.data}
              error={gitPanel.error}
              isCommitting={gitPanel.isCommitting}
              isLoading={gitPanel.isLoading}
              isStaging={gitPanel.isStaging}
              isUnstaging={gitPanel.isUnstaging}
              onCommit={gitPanel.commitStagedChanges}
              onRefresh={gitPanel.refresh}
              onStageFile={gitPanel.stageFile}
              onStageAll={gitPanel.stageUnstagedChanges}
              onUnstageFile={gitPanel.unstageFile}
              onUnstageAll={gitPanel.unstageAll}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 描述终端标签按钮组件的输入属性。
 */
interface TerminalTabButtonProps {
  tab: TerminalTab;
  isActive: boolean;
  onActivate(sessionId: string): void;
  onClose(sessionId: string): void;
}

/**
 * 渲染单个终端标签按钮和关闭入口。
 */
function TerminalTabButton({
  tab,
  isActive,
  onActivate,
  onClose,
}: TerminalTabButtonProps): ReactElement {
  /**
   * 在 pointerdown 阶段关闭标签以避免 xterm 抢占第一次点击。
   */
  const handleClosePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose(tab.id);
  };

  /**
   * 阻止关闭控件的 click 冒泡到标签激活按钮。
   */
  const handleCloseClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <button
      className={`terminal-tab${isActive ? " is-active" : ""}`}
      type="button"
      onClick={() => onActivate(tab.id)}
    >
      <SquareTerminal
        aria-hidden="true"
        className="terminal-tab-icon"
        size={14}
        strokeWidth={1.9}
      />
      <span className="terminal-tab-title">{tab.title}</span>
      <span
        className={`terminal-tab-status${tab.status === "exited" ? " is-exited" : ""}`}
      />
      <span
        className="terminal-tab-close"
        title="关闭标签"
        onPointerDown={handleClosePointerDown}
        onClick={handleCloseClick}
      >
        <X aria-hidden="true" size={13} strokeWidth={2.2} />
      </span>
    </button>
  );
}

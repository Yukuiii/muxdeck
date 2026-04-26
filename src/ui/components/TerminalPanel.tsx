import { FileCode2, GitBranch, PanelRightClose, Plus, SquareTerminal, X } from "lucide-react";
import {
  useEffect,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import type { TerminalTab } from "../../domain/workspace";
import type { GitDiffResult } from "../../types/gitPanel";
import { useGitPanel } from "../hooks/useGitPanel";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { GitDiffView } from "./GitDiffView";
import { GitSidebar } from "./GitSidebar";

interface DiffTab {
  id: string;
  path: string;
  staged: boolean;
  title: string;
  content: string;
}

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
  const [diffTabs, setDiffTabs] = useState<DiffTab[]>([]);
  const [activeDiffTabId, setActiveDiffTabId] = useState<string | undefined>(undefined);
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
  const activeDiffTab = useMemo(
    () => diffTabs.find((tab) => tab.id === activeDiffTabId),
    [activeDiffTabId, diffTabs],
  );
  const hasActiveDiff = Boolean(activeDiffTabId && activeDiffTab);
  const gitPanel = useGitPanel(activeProjectCwd, isGitSidebarOpen);
  const emptyStateText = activeProjectId
    ? "No terminal selected"
    : "No project selected";
  const hasActiveWorkspace = Boolean(activeProjectId);
  const hasActiveTerminal = Boolean(activeProjectId && activeTabId && !hasActiveDiff);
  const shouldShowEmptyState = !hasActiveDiff && !hasActiveTerminal;
  const terminalBodyStyle = {
    "--git-sidebar-width": `${gitSidebarWidth.width}px`,
  } as CSSProperties;

  /**
   * 根据文件路径生成用于 tab 显示的短标题。
   */
  const diffTabTitle = useCallback((path: string): string => {
    const normalizedPath = path.replace(/[\\/]+$/, "");
    const parts = normalizedPath.split(/[\\/]/).filter(Boolean);

    if (parts.length <= 2) {
      return normalizedPath;
    }

    return `.../${parts.slice(-2).join("/")}`;
  }, []);

  /**
   * 将后端 diff 结果转换为前端 diff tab。
   */
  const createDiffTab = useCallback(
    (diff: GitDiffResult): DiffTab => {
      const escapedPath = diff.path.replace(/[^a-zA-Z0-9_.-]/g, "_");
      return {
        id: `diff:${diff.staged ? "staged" : "unstaged"}:${escapedPath}`,
        path: diff.path,
        staged: diff.staged,
        title: diffTabTitle(diff.path),
        content: diff.content,
      };
    },
    [diffTabTitle],
  );

  /**
   * 打开或更新指定文件的 diff 标签页并切换到该标签。
   */
  const openDiffTab = useCallback(
    async (path: string, staged: boolean) => {
      if (!activeProjectCwd) {
        return;
      }

      const diff = await gitPanel.loadFileDiff(path, staged);

      if (!diff) {
        return;
      }

      const nextTab = createDiffTab(diff);

      setDiffTabs((currentTabs) => {
        const existingIndex = currentTabs.findIndex((tab) => tab.id === nextTab.id);

        if (existingIndex < 0) {
          return [...currentTabs, nextTab];
        }

        const updatedTabs = [...currentTabs];
        updatedTabs[existingIndex] = nextTab;
        return updatedTabs;
      });
      setActiveDiffTabId(nextTab.id);
    },
    [activeProjectCwd, createDiffTab, gitPanel],
  );

  /**
   * 激活一个 diff 标签页。
   */
  const activateDiffTab = useCallback((diffTabId: string) => {
    setActiveDiffTabId(diffTabId);
  }, []);

  /**
   * 关闭指定 diff 标签页。
   */
  const closeDiffTab = useCallback((diffTabId: string) => {
    setDiffTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== diffTabId);

      setActiveDiffTabId((currentActiveId) => {
        if (currentActiveId !== diffTabId) {
          return currentActiveId;
        }

        return nextTabs.at(-1)?.id;
      });

      return nextTabs;
    });
  }, []);

  /**
   * 激活终端标签时清除 diff 视图激活状态。
   */
  const activateTerminalTabWithReset = useCallback(
    (sessionId: string) => {
      setActiveDiffTabId(undefined);
      onActivateTerminalTab(sessionId);
    },
    [onActivateTerminalTab],
  );

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
              isActive={tab.id === activeTabId && !hasActiveDiff}
              onActivate={activateTerminalTabWithReset}
              onClose={onCloseTerminalTab}
            />
          ))}
          {diffTabs.map((tab) => (
            <DiffTabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeDiffTabId}
              onActivate={activateDiffTab}
              onClose={closeDiffTab}
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
              className={`terminal-surface${
                tab.id === activeTabId && !hasActiveDiff ? " is-active" : ""
              }`}
              data-session-id={tab.id}
            />
          ))}
          {activeDiffTab ? (
            <div className="terminal-diff-surface is-active">
              <GitDiffView
                content={activeDiffTab.content}
                path={activeDiffTab.path}
                staged={activeDiffTab.staged}
              />
            </div>
          ) : null}
          <div className={`empty-state${shouldShowEmptyState ? "" : " is-hidden"}`}>
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
              onOpenDiff={openDiffTab}
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

interface DiffTabButtonProps {
  tab: DiffTab;
  isActive: boolean;
  onActivate(diffTabId: string): void;
  onClose(diffTabId: string): void;
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

/**
 * 渲染单个 diff 标签按钮和关闭入口。
 */
function DiffTabButton({
  tab,
  isActive,
  onActivate,
  onClose,
}: DiffTabButtonProps): ReactElement {
  /**
   * 在 pointerdown 阶段关闭标签以避免抢占激活点击。
   */
  const handleClosePointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose(tab.id);
  };

  /**
   * 阻止关闭控件 click 冒泡到标签激活按钮。
   */
  const handleCloseClick = (event: MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <button
      className={`terminal-tab terminal-tab-diff${isActive ? " is-active" : ""}`}
      type="button"
      onClick={() => onActivate(tab.id)}
      title={tab.path}
    >
      <FileCode2
        aria-hidden="true"
        className="terminal-tab-icon terminal-tab-icon-diff"
        size={14}
        strokeWidth={1.9}
      />
      <span className="terminal-tab-title">{tab.title}</span>
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

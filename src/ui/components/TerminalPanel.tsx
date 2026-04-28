import {
  FileCode2,
  FileText,
  Files,
  GitCommitHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import type { TerminalTab } from "../../domain/workspace";
import type { GitDiffFileSnapshot, GitDiffResult } from "../../types/gitPanel";
import type { ProjectFileResult } from "../../types/projectExplorer";
import { useGitPanel } from "../hooks/useGitPanel";
import { useProjectFileSearch } from "../hooks/useProjectFileSearch";
import { useProjectTextSearch } from "../hooks/useProjectTextSearch";
import { useProjectExplorer } from "../hooks/useProjectExplorer";
import { FileContentView } from "./FileContentView";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { GitDiffView } from "./GitDiffView";
import { GitSidebar } from "./GitSidebar";
import { ProjectExplorerSidebar } from "./ProjectExplorerSidebar";
import { ProjectTextSearchSidebar } from "./ProjectTextSearchSidebar";
import { QuickOpenPalette } from "./QuickOpenPalette";
import { rankProjectFilePaths } from "../lib/fileSearch";

type SidePanelMode = "git" | "files" | "search";

interface DiffTab {
  id: string;
  kind: "diff";
  path: string;
  staged: boolean;
  title: string;
  content: string;
  files: GitDiffFileSnapshot[];
}

interface FileTab {
  id: string;
  kind: "file";
  path: string;
  title: string;
  content: string;
  isBinary: boolean;
  targetLineNumber?: number;
}

type PanelTab = DiffTab | FileTab;

/**
 * 描述单个 worktree 下的附加内容标签集合及其激活项。
 */
interface WorktreePanelTabsState {
  tabs: PanelTab[];
  activeTabId?: string;
}

/**
 * 描述终端面板组件的输入属性。
 */
export interface TerminalPanelProps {
  tabs: TerminalTab[];
  activeWorktreeId?: string;
  activeTabId?: string;
  activeWorktreeCwd?: string;
  onAddTerminalTab(): void;
  onActivateTerminalTab(sessionId: string): void;
  onCloseTerminalTab(sessionId: string): void;
  onRequestActiveTerminalFit(): void;
  onSurfaceRef(sessionId: string, element: HTMLDivElement | null): void;
}

/**
 * 渲染终端标签栏、xterm 容器和空状态。
 */
export function TerminalPanel({
  tabs,
  activeWorktreeId,
  activeTabId,
  activeWorktreeCwd,
  onAddTerminalTab,
  onActivateTerminalTab,
  onCloseTerminalTab,
  onRequestActiveTerminalFit,
  onSurfaceRef,
}: TerminalPanelProps): ReactElement {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenSelectedIndex, setQuickOpenSelectedIndex] = useState(0);
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>("git");
  const [worktreePanelTabs, setWorktreePanelTabs] = useState<
    Record<string, WorktreePanelTabsState>
  >({});
  const sidePanelWidth = useResizableWidth({
    defaultWidth: 320,
    minWidth: 260,
    maxWidth: 520,
    edge: "left",
  });
  const activeWorktreeTabs = useMemo(
    () => tabs.filter((tab) => tab.worktreeId === activeWorktreeId),
    [activeWorktreeId, tabs],
  );
  const activeWorktreePanelState = useMemo<WorktreePanelTabsState>(
    () =>
      activeWorktreeId
        ? worktreePanelTabs[activeWorktreeId] ?? { tabs: [] }
        : { tabs: [] },
    [activeWorktreeId, worktreePanelTabs],
  );
  const activePanelTabId = activeWorktreePanelState.activeTabId;
  const panelTabs = activeWorktreePanelState.tabs;
  const activePanelTab = useMemo(
    () => panelTabs.find((tab) => tab.id === activePanelTabId),
    [activePanelTabId, panelTabs],
  );
  const activeTerminalTab = useMemo(
    () => activeWorktreeTabs.find((tab) => tab.id === activeTabId),
    [activeWorktreeTabs, activeTabId],
  );
  const hasActivePanelTab = Boolean(activePanelTabId && activePanelTab);
  const gitPanel = useGitPanel(
    activeWorktreeCwd,
    isSidePanelOpen && sidePanelMode === "git",
  );
  const projectExplorer = useProjectExplorer(
    activeWorktreeCwd,
    isSidePanelOpen && sidePanelMode === "files",
  );
  const projectFileSearch = useProjectFileSearch(activeWorktreeCwd);
  const projectTextSearch = useProjectTextSearch(activeWorktreeCwd);
  const emptyStateText = activeWorktreeId
    ? "No terminal selected"
    : "No project selected";
  const hasActiveWorkspace = Boolean(activeWorktreeId);
  const hasActiveTerminal = Boolean(activeTerminalTab && !hasActivePanelTab);
  const shouldShowEmptyState = !hasActivePanelTab && !hasActiveTerminal;
  const sidePanelToggleTitle = isSidePanelOpen ? "关闭右侧面板" : "打开右侧面板";
  const terminalBodyStyle = {
    "--side-panel-width": `${sidePanelWidth.width}px`,
    "--side-panel-visible-width": `${isSidePanelOpen ? sidePanelWidth.width : 0}px`,
  } as CSSProperties;
  const quickOpenMatches = useMemo(
    () => rankProjectFilePaths(projectFileSearch.paths, quickOpenQuery),
    [projectFileSearch.paths, quickOpenQuery],
  );

  /**
   * 根据文件路径生成用于 tab 显示的短标题。
   */
  const diffTabTitle = useCallback((path: string): string => {
    const normalizedPath = path.replace(/[\\/]+$/, "");
    const parts = normalizedPath.split(/[\\/]/).filter(Boolean);

    return parts.at(-1) ?? normalizedPath;
  }, []);

  /**
   * 将后端 diff 结果转换为前端 diff tab。
   */
  const createDiffTab = useCallback(
    (diff: GitDiffResult): DiffTab => {
      const escapedPath = diff.path.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const displayTitle =
        diff.path === "__all_staged__"
          ? "All staged changes"
          : diff.path === "__all_changes__"
            ? "All changes"
            : diffTabTitle(diff.path);
      return {
        id: `diff:${diff.staged ? "staged" : "unstaged"}:${escapedPath}`,
        kind: "diff",
        path: displayTitle,
        staged: diff.staged,
        title: displayTitle,
        content: diff.content,
        files: diff.files,
      };
    },
    [diffTabTitle],
  );

  /**
   * 将后端文件内容结果转换为前端文件标签。
   */
  const createFileTab = useCallback(
    (file: ProjectFileResult, targetLineNumber?: number): FileTab => ({
      id: `file:${file.path.replace(/[^a-zA-Z0-9_.-]/g, "_")}`,
      kind: "file",
      path: file.path,
      title: diffTabTitle(file.path),
      content: file.content,
      isBinary: file.isBinary,
      targetLineNumber,
    }),
    [diffTabTitle],
  );

  /**
   * 打开或更新指定文件的 diff 标签页并切换到该标签。
   */
  const openDiffTab = useCallback(
    async (path: string, staged: boolean) => {
      if (!activeWorktreeCwd || !activeWorktreeId) {
        return;
      }

      const diff = await gitPanel.loadFileDiff(path, staged);

      if (!diff) {
        return;
      }

      const nextTab = createDiffTab(diff);

      setWorktreePanelTabs((currentStates) => {
        const currentState = currentStates[activeWorktreeId] ?? { tabs: [] };
        const existingIndex = currentState.tabs.findIndex(
          (tab) => tab.id === nextTab.id,
        );
        const nextTabs =
          existingIndex < 0
            ? [...currentState.tabs, nextTab]
            : currentState.tabs.map((tab, index) =>
                index === existingIndex ? nextTab : tab,
              );

        // 为当前 worktree 单独维护 diff tab，避免跨工作区共享。
        return {
          ...currentStates,
          [activeWorktreeId]: {
            tabs: nextTabs,
            activeTabId: nextTab.id,
          },
        };
      });
    },
    [activeWorktreeCwd, activeWorktreeId, createDiffTab, gitPanel],
  );

  /**
   * 打开某个暂存组内所有文件的 diff 标签页并切换。
   */
  const openAllDiffTab = useCallback(
    async (staged: boolean) => {
      if (!activeWorktreeCwd || !activeWorktreeId) {
        return;
      }

      const diff = await gitPanel.loadAllDiffs(staged);

      if (!diff) {
        return;
      }

      const nextTab = createDiffTab(diff);

      setWorktreePanelTabs((currentStates) => {
        const currentState = currentStates[activeWorktreeId] ?? { tabs: [] };
        const existingIndex = currentState.tabs.findIndex(
          (tab) => tab.id === nextTab.id,
        );
        const nextTabs =
          existingIndex < 0
            ? [...currentState.tabs, nextTab]
            : currentState.tabs.map((tab, index) =>
                index === existingIndex ? nextTab : tab,
              );

        // 为当前 worktree 单独维护 diff tab，避免跨工作区共享。
        return {
          ...currentStates,
          [activeWorktreeId]: {
            tabs: nextTabs,
            activeTabId: nextTab.id,
          },
        };
      });
    },
    [activeWorktreeCwd, activeWorktreeId, createDiffTab, gitPanel],
  );

  /**
   * 打开或更新指定文件标签页并切换到该标签。
   */
  const openFileTab = useCallback(
    async (path: string, targetLineNumber?: number) => {
      if (!activeWorktreeCwd || !activeWorktreeId) {
        return;
      }

      const file = await projectExplorer.openFile(path);

      if (!file) {
        return;
      }

      const nextTab = createFileTab(file, targetLineNumber);

      setWorktreePanelTabs((currentStates) => {
        const currentState = currentStates[activeWorktreeId] ?? { tabs: [] };
        const existingIndex = currentState.tabs.findIndex(
          (tab) => tab.id === nextTab.id,
        );
        const nextTabs =
          existingIndex < 0
            ? [...currentState.tabs, nextTab]
            : currentState.tabs.map((tab, index) =>
                index === existingIndex ? nextTab : tab,
              );

        return {
          ...currentStates,
          [activeWorktreeId]: {
            tabs: nextTabs,
            activeTabId: nextTab.id,
          },
        };
      });
    },
    [activeWorktreeCwd, activeWorktreeId, createFileTab, projectExplorer],
  );

  /**
   * 打开快速打开浮层并按需加载当前项目的全量文件路径。
   */
  const openQuickOpen = useCallback(() => {
    setIsQuickOpenOpen(true);
    setQuickOpenQuery("");
    setQuickOpenSelectedIndex(0);

    void projectFileSearch.loadFiles();
  }, [projectFileSearch]);

  /**
   * 打开右侧全文搜索面板并聚焦搜索输入。
   */
  const openTextSearchPanel = useCallback(() => {
    if (!activeWorktreeCwd) {
      return;
    }

    setIsSidePanelOpen(true);
    setSidePanelMode("search");
  }, [activeWorktreeCwd]);

  /**
   * 关闭快速打开浮层并重置查询态。
   */
  const closeQuickOpen = useCallback(() => {
    setIsQuickOpenOpen(false);
    setQuickOpenQuery("");
    setQuickOpenSelectedIndex(0);
  }, []);

  /**
   * 从快速打开结果中打开目标文件，并在成功后关闭浮层。
   */
  const openQuickOpenMatch = useCallback(
    (path: string) => {
      closeQuickOpen();
      void openFileTab(path);
    },
    [closeQuickOpen, openFileTab],
  );

  /**
   * 从全文搜索结果中打开目标文件。
   */
  const openTextSearchMatch = useCallback(
    (path: string, lineNumber: number) => {
      void openFileTab(path, lineNumber);
    },
    [openFileTab],
  );

  /**
   * 激活一个附加内容标签页。
   */
  const activatePanelTab = useCallback(
    (panelTabId: string) => {
      if (!activeWorktreeId) {
        return;
      }

      setWorktreePanelTabs((currentStates) => {
        const currentState = currentStates[activeWorktreeId];

        if (!currentState) {
          return currentStates;
        }

        return {
          ...currentStates,
          [activeWorktreeId]: {
            ...currentState,
            activeTabId: panelTabId,
          },
        };
      });
    },
    [activeWorktreeId],
  );

  /**
   * 关闭指定附加内容标签页。
   */
  const closePanelTab = useCallback(
    (panelTabId: string) => {
      if (!activeWorktreeId) {
        return;
      }

      setWorktreePanelTabs((currentStates) => {
        const currentState = currentStates[activeWorktreeId];

        if (!currentState) {
          return currentStates;
        }

        const nextTabs = currentState.tabs.filter((tab) => tab.id !== panelTabId);
        const nextActiveTabId =
          currentState.activeTabId === panelTabId
            ? nextTabs.at(-1)?.id
            : currentState.activeTabId;

        if (nextTabs.length === 0 && !nextActiveTabId) {
          const nextStates = { ...currentStates };
          delete nextStates[activeWorktreeId];
          return nextStates;
        }

        return {
          ...currentStates,
          [activeWorktreeId]: {
            tabs: nextTabs,
            activeTabId: nextActiveTabId,
          },
        };
      });
    },
    [activeWorktreeId],
  );

  /**
   * 按当前激活顺序关闭一个可见标签，优先关闭附加内容标签。
   */
  const closeActiveTab = useCallback(() => {
    if (activePanelTabId) {
      closePanelTab(activePanelTabId);
      return;
    }

    if (activeTerminalTab) {
      onCloseTerminalTab(activeTerminalTab.id);
    }
  }, [activePanelTabId, activeTerminalTab, closePanelTab, onCloseTerminalTab]);

  /**
   * 搜索结果变化后自动把选中项约束在有效范围内。
   */
  useEffect(() => {
    if (quickOpenMatches.length === 0) {
      if (quickOpenSelectedIndex !== 0) {
        setQuickOpenSelectedIndex(0);
      }
      return;
    }

    if (quickOpenSelectedIndex >= quickOpenMatches.length) {
      setQuickOpenSelectedIndex(0);
    }
  }, [quickOpenMatches, quickOpenSelectedIndex]);

  /**
   * 激活终端标签时清除附加内容视图激活状态。
   */
  const activateTerminalTabWithReset = useCallback(
    (sessionId: string) => {
      if (activeWorktreeId) {
        setWorktreePanelTabs((currentStates) => {
          const currentState = currentStates[activeWorktreeId];

          if (!currentState || !currentState.activeTabId) {
            return currentStates;
          }

          return {
            ...currentStates,
            [activeWorktreeId]: {
              ...currentState,
              activeTabId: undefined,
            },
          };
        });
      }

      onActivateTerminalTab(sessionId);
    },
    [activeWorktreeId, onActivateTerminalTab],
  );

  /**
   * 拦截 Ctrl/Cmd+W，优先关闭当前活动标签，并阻止窗口默认关闭行为。
   */
  useEffect(() => {
    const handleCloseShortcut = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.metaKey || event.ctrlKey;

      if (
        !isPrimaryModifier ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "w"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeActiveTab();
    };

    window.addEventListener("keydown", handleCloseShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleCloseShortcut, { capture: true });
    };
  }, [closeActiveTab]);

  /**
   * 拦截 Ctrl/Cmd+P，打开当前活动项目的全局文件快速搜索。
   */
  useEffect(() => {
    const handleQuickOpenShortcut = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.metaKey || event.ctrlKey;

      if (
        !isPrimaryModifier ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "p"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!activeWorktreeCwd) {
        return;
      }

      openQuickOpen();
    };

    window.addEventListener("keydown", handleQuickOpenShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleQuickOpenShortcut, { capture: true });
    };
  }, [activeWorktreeCwd, openQuickOpen]);

  /**
   * 拦截 Ctrl/Cmd+Shift+F，打开当前活动项目的全文搜索面板。
   */
  useEffect(() => {
    const handleTextSearchShortcut = (event: KeyboardEvent) => {
      const isPrimaryModifier = event.metaKey || event.ctrlKey;

      if (
        !isPrimaryModifier ||
        event.altKey ||
        !event.shiftKey ||
        event.key.toLowerCase() !== "f"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openTextSearchPanel();
    };

    window.addEventListener("keydown", handleTextSearchShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleTextSearchShortcut, { capture: true });
    };
  }, [openTextSearchPanel]);

  /**
   * 没有活动 worktree 时关闭右侧面板并重置默认模式。
  */
  useEffect(() => {
    if (!activeWorktreeCwd) {
      closeQuickOpen();
      setIsSidePanelOpen(false);
      setSidePanelMode("git");
    }
  }, [activeWorktreeCwd, closeQuickOpen]);

  /**
   * 右侧面板开关或宽度变化时，在绘制前同步活动终端尺寸，减少视觉闪烁。
   */
  useLayoutEffect(() => {
    if (!activeTabId || hasActivePanelTab) {
      return;
    }

    onRequestActiveTerminalFit();
  }, [
    activeTabId,
    sidePanelWidth.width,
    hasActivePanelTab,
    isSidePanelOpen,
    onRequestActiveTerminalFit,
  ]);

  return (
    <section
      className={`terminal-panel${hasActiveWorkspace ? " has-active-workspace" : ""}`}
    >
      <QuickOpenPalette
        error={projectFileSearch.error}
        isLoading={projectFileSearch.isLoading}
        isOpen={isQuickOpenOpen}
        matches={quickOpenMatches}
        query={quickOpenQuery}
        selectedIndex={quickOpenSelectedIndex}
        onChangeQuery={(query) => {
          setQuickOpenQuery(query);
          setQuickOpenSelectedIndex(0);
        }}
        onClose={closeQuickOpen}
        onOpenMatch={openQuickOpenMatch}
        onSelectIndex={setQuickOpenSelectedIndex}
      />
      <div className={`terminal-tabbar${hasActiveWorkspace ? "" : " is-hidden"}`}>
        <nav className="terminal-tabs" aria-label="终端标签">
          {activeWorktreeTabs.map((tab) => (
            <TerminalTabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId && !hasActivePanelTab}
              onActivate={activateTerminalTabWithReset}
              onClose={onCloseTerminalTab}
            />
          ))}
          {panelTabs.map((tab) => (
            <PanelTabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activePanelTabId}
              onActivate={activatePanelTab}
              onClose={closePanelTab}
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
          className={`terminal-tab-action${isSidePanelOpen ? " is-active" : ""}`}
          type="button"
          title={sidePanelToggleTitle}
          disabled={!activeWorktreeCwd}
          onClick={() => {
            if (!isSidePanelOpen) {
              setIsSidePanelOpen(true);
              return;
            }

            setIsSidePanelOpen(false);
          }}
        >
          {isSidePanelOpen ? (
            <PanelRightClose aria-hidden="true" size={15} strokeWidth={2} />
          ) : (
            <PanelRightOpen aria-hidden="true" size={15} strokeWidth={2} />
          )}
        </button>
      </div>

      <div
        className={`terminal-body${isSidePanelOpen ? " has-side-panel" : ""}`}
        style={terminalBodyStyle}
      >
        <div className="terminal-host">
          {tabs.map((tab) => (
            <TerminalSurface
              key={tab.id}
              tab={tab}
              isActive={
                tab.id === activeTabId &&
                tab.worktreeId === activeWorktreeId &&
                !hasActivePanelTab
              }
              onSurfaceRef={onSurfaceRef}
            />
          ))}
          {activePanelTab?.kind === "diff" ? (
            <div className="terminal-diff-surface is-active">
              <GitDiffView
                content={activePanelTab.content}
                files={activePanelTab.files}
                path={activePanelTab.path}
                staged={activePanelTab.staged}
              />
            </div>
          ) : null}
          {activePanelTab?.kind === "file" ? (
            <div className="terminal-diff-surface is-active">
              <FileContentView
                content={activePanelTab.content}
                isBinary={activePanelTab.isBinary}
                path={activePanelTab.path}
                targetLineNumber={activePanelTab.targetLineNumber}
              />
            </div>
          ) : null}
          <div className={`empty-state${shouldShowEmptyState ? "" : " is-hidden"}`}>
            {emptyStateText}
          </div>
        </div>
        <div className="side-panel-shell">
          <div
            className="side-panel-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整右侧面板宽度"
            onPointerDown={(event) => sidePanelWidth.startResize(event)}
          />
          <div className="side-panel-mode-rail" aria-label="右侧面板模式">
            <button
              className={`side-panel-mode-button${
                sidePanelMode === "git" ? " is-active" : ""
              }`}
              type="button"
              title="源码管理"
              aria-label="源码管理"
              onClick={() => setSidePanelMode("git")}
            >
              <GitCommitHorizontal aria-hidden="true" size={15} strokeWidth={2} />
            </button>
            <button
              className={`side-panel-mode-button${
                sidePanelMode === "files" ? " is-active" : ""
              }`}
              type="button"
              title="文件树"
              aria-label="文件树"
              onClick={() => setSidePanelMode("files")}
            >
              <Files aria-hidden="true" size={15} strokeWidth={2} />
            </button>
            <button
              className={`side-panel-mode-button${
                sidePanelMode === "search" ? " is-active" : ""
              }`}
              type="button"
              title="全文搜索"
              aria-label="全文搜索"
              onClick={() => setSidePanelMode("search")}
            >
              <Search aria-hidden="true" size={15} strokeWidth={2} />
            </button>
          </div>
          <div className="side-panel-content">
            {sidePanelMode === "git" ? (
              <GitSidebar
                data={gitPanel.data}
                error={gitPanel.error}
                isCommitting={gitPanel.isCommitting}
                isLoading={gitPanel.isLoading}
                isPushing={gitPanel.isPushing}
                isStaging={gitPanel.isStaging}
                isUnstaging={gitPanel.isUnstaging}
                onCommit={gitPanel.commitStagedChanges}
                onOpenAllDiff={openAllDiffTab}
                onOpenDiff={openDiffTab}
                onPush={gitPanel.pushCurrentBranch}
                onRefresh={gitPanel.refresh}
                onStageFile={gitPanel.stageFile}
                onStageAll={gitPanel.stageUnstagedChanges}
                onUnstageFile={gitPanel.unstageFile}
                onUnstageAll={gitPanel.unstageAll}
              />
            ) : null}
            {sidePanelMode === "files" ? (
              <ProjectExplorerSidebar
                activeFilePath={
                  activePanelTab?.kind === "file" ? activePanelTab.path : undefined
                }
                cwd={activeWorktreeCwd}
                entriesByDirectory={projectExplorer.entriesByDirectory}
                error={projectExplorer.error}
                expandedDirectories={projectExplorer.expandedDirectories}
                isLoadingRoot={projectExplorer.isLoadingRoot}
                loadingDirectories={projectExplorer.loadingDirectories}
                openingFilePath={projectExplorer.openingFilePath}
                onOpenFile={(path) => {
                  void openFileTab(path);
                }}
                onRefresh={projectExplorer.refresh}
                onToggleDirectory={projectExplorer.toggleDirectory}
              />
            ) : null}
            {sidePanelMode === "search" ? (
              <ProjectTextSearchSidebar
                cwd={activeWorktreeCwd}
                error={projectTextSearch.error}
                isSearching={projectTextSearch.isSearching}
                query={projectTextSearch.query}
                result={projectTextSearch.result}
                onChangeQuery={projectTextSearch.setQuery}
                onClear={projectTextSearch.clear}
                onOpenMatch={openTextSearchMatch}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 描述终端标签按钮组件的输入属性。
 */
interface TerminalSurfaceProps {
  tab: TerminalTab;
  isActive: boolean;
  onSurfaceRef(sessionId: string, element: HTMLDivElement | null): void;
}

/**
 * 渲染单个终端 surface 并使用稳定 ref 回调避免重复解绑。
 */
function TerminalSurface({
  tab,
  isActive,
  onSurfaceRef,
}: TerminalSurfaceProps): ReactElement {
  const handleSurfaceRef = useCallback(
    (element: HTMLDivElement | null) => {
      onSurfaceRef(tab.id, element);
    },
    [onSurfaceRef, tab.id],
  );

  return (
    <div
      ref={handleSurfaceRef}
      className={`terminal-surface${isActive ? " is-active" : ""}`}
      data-session-id={tab.id}
    />
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

interface PanelTabButtonProps {
  tab: PanelTab;
  isActive: boolean;
  onActivate(panelTabId: string): void;
  onClose(panelTabId: string): void;
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
 * 渲染单个附加内容标签按钮和关闭入口。
 */
function PanelTabButton({
  tab,
  isActive,
  onActivate,
  onClose,
}: PanelTabButtonProps): ReactElement {
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
      className={`terminal-tab terminal-tab-diff${
        tab.kind === "file" ? " terminal-tab-file" : ""
      }${isActive ? " is-active" : ""}`}
      type="button"
      onClick={() => onActivate(tab.id)}
      title={tab.path}
    >
      {tab.kind === "diff" ? (
        <FileCode2
          aria-hidden="true"
          className="terminal-tab-icon terminal-tab-icon-diff"
          size={14}
          strokeWidth={1.9}
        />
      ) : (
        <FileText
          aria-hidden="true"
          className="terminal-tab-icon terminal-tab-icon-file"
          size={14}
          strokeWidth={1.9}
        />
      )}
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

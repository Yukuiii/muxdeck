import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  Plus,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";
import { normalizeApplicationError } from "../../application/errors";
import type { Project, Worktree } from "../../domain/workspace";

const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_PADDING = 12;

/**
 * 描述项目侧边栏组件的输入属性。
 */
export interface ProjectSidebarProps {
  projects: Project[];
  worktrees: Worktree[];
  activeProjectId?: string;
  activeWorktreeId?: string;
  onAddProject(): Promise<void>;
  onActivateProject(projectId: string): void;
  onActivateWorktree(worktreeId: string): void;
  onCreateWorktree(projectId: string, branchName: string): Promise<void>;
  onRemoveProject(projectId: string): void;
  onRemoveWorktreeFromApp(worktreeId: string): void;
  onRemoveWorktree(worktreeId: string): Promise<void>;
}

interface CreateWorktreeDialogState {
  projectId: string;
  branchName: string;
  isSubmitting: boolean;
  error?: string;
}

type ContextMenuState =
  | {
      kind: "project";
      projectId: string;
      x: number;
      y: number;
    }
  | {
      kind: "worktree";
      worktreeId: string;
      x: number;
      y: number;
    };

/**
 * 渲染项目树、worktree 列表以及创建入口。
 */
export function ProjectSidebar({
  projects,
  worktrees,
  activeProjectId,
  activeWorktreeId,
  onAddProject,
  onActivateProject,
  onActivateWorktree,
  onCreateWorktree,
  onRemoveProject,
  onRemoveWorktreeFromApp,
  onRemoveWorktree,
}: ProjectSidebarProps): ReactElement {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [createDialog, setCreateDialog] =
    useState<CreateWorktreeDialogState | null>(null);
  const [sidebarError, setSidebarError] = useState<string>();
  const hasInitializedExpandedProjectsRef = useRef(false);
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const worktreeById = useMemo(
    () => new Map(worktrees.map((worktree) => [worktree.id, worktree])),
    [worktrees],
  );
  const worktreesByProjectId = useMemo(() => {
    const grouped = new Map<string, Worktree[]>();

    for (const project of projects) {
      grouped.set(
        project.id,
        project.worktreeIds
          .map((worktreeId) => worktreeById.get(worktreeId))
          .filter((worktree): worktree is Worktree => Boolean(worktree)),
      );
    }

    return grouped;
  }, [projectById, projects, worktreeById]);
  const contextMenuPosition = useMemo(() => {
    if (!contextMenu) {
      return null;
    }

    const itemCount = contextMenu.kind === "project" ? 1 : 2;

    return getContextMenuPosition(contextMenu.x, contextMenu.y, itemCount);
  }, [contextMenu]);

  /**
   * 关闭上下文菜单。
   */
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /**
   * 切换项目展开状态。
   */
  const toggleProjectExpanded = useCallback((projectId: string) => {
    setExpandedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId],
    );
  }, []);

  /**
   * 打开创建 worktree 对话框，并初始化新的分支名输入。
   */
  const openCreateWorktreeDialog = useCallback((projectId: string) => {
    setSidebarError(undefined);
    setCreateDialog({
      projectId,
      branchName: "",
      isSubmitting: false,
    });
  }, []);

  /**
   * 触发添加项目流程，并将异常收敛到侧边栏错误提示。
   */
  const handleAddProject = useCallback(async () => {
    setSidebarError(undefined);

    try {
      await onAddProject();
    } catch (error) {
      setSidebarError(normalizeApplicationError(error).message);
    }
  }, [onAddProject]);

  /**
   * 关闭创建 worktree 对话框。
   */
  const closeCreateWorktreeDialog = useCallback(() => {
    setCreateDialog(null);
  }, []);

  /**
   * 提交创建 worktree 请求。
   */
  const submitCreateWorktree = useCallback(async () => {
    const branchName = createDialog?.branchName.trim();

    if (!createDialog || !branchName) {
      return;
    }

    setCreateDialog((current) =>
      current
        ? {
            ...current,
            isSubmitting: true,
            error: undefined,
          }
        : current,
    );

    try {
      await onCreateWorktree(createDialog.projectId, branchName);
      setSidebarError(undefined);
      setCreateDialog(null);
    } catch (error) {
      setCreateDialog((current) =>
        current
          ? {
              ...current,
              isSubmitting: false,
              error: normalizeApplicationError(error).message,
            }
          : current,
      );
    }
  }, [createDialog, onCreateWorktree]);

  /**
   * 执行项目或 worktree 的上下文菜单动作。
   */
  const handleContextAction = useCallback(
    async (action: "removeProject" | "removeWorktree" | "removeWorktreeFromApp") => {
      if (!contextMenu) {
        return;
      }

      closeContextMenu();
      setSidebarError(undefined);

      try {
        if (action === "removeProject" && contextMenu.kind === "project") {
          onRemoveProject(contextMenu.projectId);
          return;
        }

        if (action === "removeWorktreeFromApp" && contextMenu.kind === "worktree") {
          onRemoveWorktreeFromApp(contextMenu.worktreeId);
          return;
        }

        if (action === "removeWorktree" && contextMenu.kind === "worktree") {
          await onRemoveWorktree(contextMenu.worktreeId);
        }
      } catch (error) {
        setSidebarError(normalizeApplicationError(error).message);
      }
    },
    [
      closeContextMenu,
      contextMenu,
      onRemoveProject,
      onRemoveWorktree,
      onRemoveWorktreeFromApp,
    ],
  );

  useEffect(() => {
    if (!activeProjectId || hasInitializedExpandedProjectsRef.current) {
      return;
    }

    hasInitializedExpandedProjectsRef.current = true;
    setExpandedProjectIds((current) =>
      current.includes(activeProjectId) ? current : [...current, activeProjectId],
    );
  }, [activeProjectId]);

  useEffect(() => {
    const handlePointerDown = () => closeContextMenu();
    const handleWindowBlur = () => closeContextMenu();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
        setCreateDialog(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeContextMenu]);

  return (
    <>
      <aside className="relative flex min-w-0 flex-col border-r border-[var(--ctp-surface0)] bg-[var(--ctp-mantle)]">
        <nav
          className="flex flex-col gap-1.5 overflow-hidden overflow-y-auto px-1.5 pt-1.5"
          aria-label="项目"
        >
          {projects.map((project) => {
            const projectWorktrees = worktreesByProjectId.get(project.id) ?? [];
            const isExpanded = expandedProjectIds.includes(project.id);
            const isActiveProject = project.id === activeProjectId;

            return (
              <section key={project.id} className="min-w-0">
                <ProjectTreeRow
                  project={project}
                  isActive={isActiveProject}
                  isExpanded={isExpanded}
                  worktreeCount={projectWorktrees.length}
                  onActivate={() => {
                    if (isActiveProject) {
                      toggleProjectExpanded(project.id);
                      return;
                    }

                    onActivateProject(project.id);
                  }}
                  onToggleExpanded={() => toggleProjectExpanded(project.id)}
                  onContextMenu={(x, y) =>
                    setContextMenu({
                      kind: "project",
                      projectId: project.id,
                      x,
                      y,
                    })
                  }
                />
                {isExpanded ? (
                  <div className="mt-1 flex min-w-0 flex-col gap-1">
                    {projectWorktrees.map((worktree) => (
                      <WorktreeTreeRow
                        key={worktree.id}
                        worktree={worktree}
                        isActive={worktree.id === activeWorktreeId}
                        onActivate={() => onActivateWorktree(worktree.id)}
                        onContextMenu={
                          worktree.isMain
                            ? undefined
                            : (x, y) =>
                                setContextMenu({
                                  kind: "worktree",
                                  worktreeId: worktree.id,
                                  x,
                                  y,
                                })
                        }
                      />
                    ))}
                    <button
                      className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1 py-1.5 text-left text-[var(--ctp-subtext0)] transition-colors hover:text-[var(--ctp-text)]"
                      type="button"
                      onClick={() => {
                        void openCreateWorktreeDialog(project.id);
                      }}
                    >
                      <span className="inline-grid size-6 flex-none place-items-center rounded-md bg-[var(--ctp-surface0)] text-[var(--ctp-lavender)]">
                        <Plus size={13} strokeWidth={2.4} />
                      </span>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold">
                        Add Worktree
                      </span>
                    </button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
        <div className="px-3 pb-3 pt-2">
          <button
            className="flex min-h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1 py-1.5 text-left text-[var(--ctp-subtext0)] transition-colors hover:text-[var(--ctp-text)]"
            type="button"
            onClick={() => {
              void handleAddProject();
            }}
          >
            <span className="inline-grid size-6 flex-none place-items-center rounded-md bg-[var(--ctp-surface0)] text-[var(--ctp-lavender)]">
              <Plus size={13} strokeWidth={2.4} />
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold">
              Add Project
            </span>
          </button>
          {sidebarError ? (
            <p className="mt-2 text-[11px] font-medium text-[var(--ctp-red)]">
              {sidebarError}
            </p>
          ) : null}
        </div>
        {contextMenu && contextMenuPosition ? (
          <div
            className="fixed z-50 w-[224px] overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--ctp-overlay0)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--ctp-mantle)_92%,var(--ctp-base))] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl"
            style={{
              left: `${contextMenuPosition.left}px`,
              top: `${contextMenuPosition.top}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {contextMenu.kind === "project" ? (
              <ContextMenuButton
                label="移除项目"
                tone="danger"
                onClick={() => {
                  void handleContextAction("removeProject");
                }}
              />
            ) : (
              <>
                <ContextMenuButton
                  label="从应用移除"
                  onClick={() => {
                    void handleContextAction("removeWorktreeFromApp");
                  }}
                />
                <ContextMenuButton
                  label="删除 worktree"
                  tone="danger"
                  onClick={() => {
                    void handleContextAction("removeWorktree");
                  }}
                />
              </>
            )}
          </div>
        ) : null}
      </aside>
      {createDialog ? (
        <CreateWorktreeDialog
          project={projectById.get(createDialog.projectId)}
          state={createDialog}
          onClose={closeCreateWorktreeDialog}
          onChangeBranch={(branchName) =>
            setCreateDialog((current) =>
              current
                ? {
                    ...current,
                    branchName,
                  }
                : current,
            )
          }
          onSubmit={() => {
            void submitCreateWorktree();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 渲染项目树中的项目节点。
 */
function ProjectTreeRow({
  project,
  isActive,
  isExpanded,
  worktreeCount,
  onActivate,
  onToggleExpanded,
  onContextMenu,
}: {
  project: Project;
  isActive: boolean;
  isExpanded: boolean;
  worktreeCount: number;
  onActivate(): void;
  onToggleExpanded(): void;
  onContextMenu(x: number, y: number): void;
}): ReactElement {
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onContextMenu(event.clientX, event.clientY);
    },
    [onContextMenu],
  );

  return (
    <div
      className={`flex min-h-[42px] min-w-0 items-center gap-1 rounded-lg border border-transparent pr-2 text-[var(--ctp-text)] hover:bg-[var(--ctp-surface0)] ${
        isActive ? "bg-[var(--ctp-surface0)]" : "bg-transparent"
      }`}
      onContextMenu={handleContextMenu}
    >
      <button
        className="inline-grid size-8 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[var(--ctp-overlay2)] hover:text-[var(--ctp-text)]"
        type="button"
        aria-label={isExpanded ? "折叠项目" : "展开项目"}
        onClick={onToggleExpanded}
      >
        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-0 py-[7px] text-left"
        type="button"
        onClick={onActivate}
      >
        <span className="inline-grid size-6 flex-none place-items-center rounded-md bg-[var(--ctp-mauve)] text-xs font-extrabold text-[var(--ctp-base)]">
          {project.title.slice(0, 1).toUpperCase()}
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold">
            {project.title}
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-[var(--ctp-overlay2)]">
            {worktreeCount === 1 ? "1 worktree" : `${worktreeCount} worktrees`}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * 渲染项目树中的 worktree 节点。
 */
function WorktreeTreeRow({
  worktree,
  isActive,
  onActivate,
  onContextMenu,
}: {
  worktree: Worktree;
  isActive: boolean;
  onActivate(): void;
  onContextMenu?: (x: number, y: number) => void;
}): ReactElement {
  const subtitle = worktree.isMain
    ? "Primary worktree"
    : worktree.branch ?? worktree.cwd;
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!onContextMenu) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onContextMenu(event.clientX, event.clientY);
    },
    [onContextMenu],
  );

  return (
    <button
      className={`flex min-h-[36px] w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
        isActive
          ? "border-[color:color-mix(in_srgb,var(--ctp-lavender)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--ctp-surface0)_82%,transparent)]"
          : "border-transparent bg-[color:color-mix(in_srgb,var(--ctp-surface0)_18%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--ctp-surface0)_48%,transparent)]"
      }`}
      type="button"
      onClick={onActivate}
      onContextMenu={handleContextMenu}
    >
      <span
        className={`inline-grid size-5 flex-none place-items-center rounded-md ${
          isActive
            ? "bg-[color:color-mix(in_srgb,var(--ctp-lavender)_18%,var(--ctp-surface0))] text-[var(--ctp-lavender)]"
            : "bg-[color:color-mix(in_srgb,var(--ctp-surface0)_88%,transparent)] text-[var(--ctp-overlay2)]"
        }`}
      >
        {worktree.isMain ? (
          <FolderGit2 size={11} strokeWidth={2.2} />
        ) : (
          <GitBranch size={11} strokeWidth={2.2} />
        )}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold text-[var(--ctp-text)]">
          {worktree.title}
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ctp-overlay1)]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

/**
 * 渲染上下文菜单中的单个操作按钮。
 */
function ContextMenuButton({
  label,
  tone = "default",
  onClick,
}: {
  label: string;
  tone?: "default" | "danger";
  onClick(): void;
}): ReactElement {
  return (
    <button
      className={`flex w-full cursor-pointer items-center rounded-lg border-0 px-3 py-2 text-left text-[12px] font-semibold transition-colors ${
        tone === "danger"
          ? "bg-transparent text-[var(--ctp-red)] hover:bg-[color:color-mix(in_srgb,var(--ctp-red)_16%,transparent)]"
          : "bg-transparent text-[var(--ctp-text)] hover:bg-[var(--ctp-surface0)]"
      }`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * 渲染创建 worktree 的模态对话框。
 */
function CreateWorktreeDialog({
  project,
  state,
  onClose,
  onChangeBranch,
  onSubmit,
}: {
  project?: Project;
  state: CreateWorktreeDialogState;
  onClose(): void;
  onChangeBranch(branchName: string): void;
  onSubmit(): void;
}): ReactElement {
  const canSubmit = !state.isSubmitting && Boolean(state.branchName.trim());

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-[color:color-mix(in_srgb,var(--ctp-crust)_58%,transparent)] px-4 pt-18"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-[var(--ctp-surface0)] bg-[color:color-mix(in_srgb,var(--ctp-mantle)_96%,black_4%)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4">
          <p className="text-[14px] font-bold text-[var(--ctp-text)]">
            Create Worktree
          </p>
          <p className="mt-1 text-[12px] font-medium text-[var(--ctp-overlay1)]">
            {project
              ? `项目：${project.title}`
              : "输入新的分支名来创建 linked worktree。"}
          </p>
        </div>
        <>
          <label className="mb-2 block text-[12px] font-semibold text-[var(--ctp-subtext1)]">
            New Branch
          </label>
          <input
            className="w-full rounded-xl border border-[var(--ctp-surface0)] bg-[var(--ctp-base)] px-3 py-3 text-[13px] font-medium text-[var(--ctp-text)] outline-none placeholder:text-[var(--ctp-overlay1)] focus:border-[color:color-mix(in_srgb,var(--ctp-blue)_56%,var(--ctp-surface1))]"
            type="text"
            value={state.branchName}
            placeholder="例如：feature/new-sidebar"
            autoFocus
            onChange={(event) => onChangeBranch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSubmit) {
                onSubmit();
              }
            }}
            disabled={state.isSubmitting}
          />
          {state.error ? (
            <p className="mt-3 text-[11px] font-medium text-[var(--ctp-red)]">
              {state.error}
            </p>
          ) : (
            <p className="mt-3 text-[11px] font-medium text-[var(--ctp-overlay1)]">
              会基于当前项目最近激活 worktree 的 HEAD 创建新分支，并将新 worktree 放到 `~/.muxdeck/worktrees`。
            </p>
          )}
        </>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="cursor-pointer rounded-lg border border-[var(--ctp-surface0)] bg-transparent px-3 py-2 text-[12px] font-semibold text-[var(--ctp-subtext1)] transition-colors hover:bg-[var(--ctp-surface0)] hover:text-[var(--ctp-text)]"
            type="button"
            onClick={onClose}
            disabled={state.isSubmitting}
          >
            取消
          </button>
          <button
            className="cursor-pointer rounded-lg border-0 bg-[var(--ctp-blue)] px-3 py-2 text-[12px] font-semibold text-[var(--ctp-base)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {state.isSubmitting ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 根据点击位置计算上下文菜单坐标。
 */
function getContextMenuPosition(x: number, y: number, itemCount: number): {
  left: number;
  top: number;
} {
  const menuHeight = CONTEXT_MENU_PADDING * 2 + itemCount * 36;
  const maxLeft = window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_PADDING;
  const maxTop = window.innerHeight - menuHeight - CONTEXT_MENU_PADDING;

  return {
    left: clamp(x, CONTEXT_MENU_PADDING, Math.max(CONTEXT_MENU_PADDING, maxLeft)),
    top: clamp(y, CONTEXT_MENU_PADDING, Math.max(CONTEXT_MENU_PADDING, maxTop)),
  };
}

/**
 * 把数值约束到指定区间。
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

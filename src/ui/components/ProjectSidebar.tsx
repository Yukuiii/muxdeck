import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactElement,
} from "react";
import { Plus } from "lucide-react";
import type { Project } from "../../domain/workspace";

const CONTEXT_MENU_WIDTH = 224;
const CONTEXT_MENU_HEIGHT = 58;
const CONTEXT_MENU_PADDING = 12;

/**
 * 描述项目侧边栏组件的输入属性。
 */
export interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId?: string;
  onAddProject(): Promise<void>;
  onActivateProject(projectId: string): void;
  onRemoveProject(projectId: string): void;
}

interface ContextMenuState {
  project: Project;
  x: number;
  y: number;
}

/**
 * 约束菜单位置，避免弹层超出视口。
 */
function getContextMenuPosition(
  x: number,
  y: number,
): { left: number; top: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = Math.max(
    CONTEXT_MENU_PADDING,
    viewportWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_PADDING,
  );
  const maxTop = Math.max(
    CONTEXT_MENU_PADDING,
    viewportHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_PADDING,
  );

  return {
    left: Math.min(Math.max(x, CONTEXT_MENU_PADDING), maxLeft),
    top: Math.min(Math.max(y, CONTEXT_MENU_PADDING), maxTop),
  };
}

/**
 * 渲染项目列表和添加项目入口。
 */
export function ProjectSidebar({
  projects,
  activeProjectId,
  onAddProject,
  onActivateProject,
  onRemoveProject,
}: ProjectSidebarProps): ReactElement {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const contextMenuPosition = useMemo(
    () =>
      contextMenu
        ? getContextMenuPosition(contextMenu.x, contextMenu.y)
        : null,
    [contextMenu],
  );

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleGlobalClick = () => closeContextMenu();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeContextMenu, contextMenu]);

  return (
    <aside className="relative flex min-w-0 flex-col border-r border-[var(--ctp-surface0)] bg-[var(--ctp-mantle)]">
      <nav
        className="flex flex-col gap-1.5 overflow-hidden overflow-y-auto px-1.5 pt-1.5"
        aria-label="项目"
      >
        {projects.map((project) => (
          <ProjectButton
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            onActivate={onActivateProject}
            onContextMenu={(x, y) =>
              setContextMenu({ project, x, y })
            }
          />
        ))}
      </nav>
      <button
        className="mx-3 my-3 flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1 py-1.5 text-left text-[var(--ctp-subtext0)] transition-colors hover:text-[var(--ctp-text)]"
        type="button"
        onClick={() => {
          void onAddProject();
        }}
      >
        <span className="inline-grid size-6 flex-none place-items-center rounded-md bg-[var(--ctp-surface0)] text-[var(--ctp-lavender)]">
          <Plus aria-hidden="true" size={13} strokeWidth={2.4} />
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold">
          Add Project
        </span>
      </button>
      {contextMenu ? (
        <div
          className="fixed z-50 w-[224px] overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--ctp-overlay0)_42%,transparent)] bg-[color:color-mix(in_srgb,var(--ctp-mantle)_92%,var(--ctp-base))] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          style={{ left: contextMenuPosition?.left, top: contextMenuPosition?.top }}
          role="menu"
          aria-label={`${contextMenu.project.title} 的项目菜单`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="flex w-full cursor-pointer items-center justify-between rounded-lg border-0 bg-transparent px-3 py-2 text-left transition-colors hover:bg-[color:color-mix(in_srgb,var(--ctp-red)_10%,transparent)]"
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onRemoveProject(contextMenu.project.id);
              closeContextMenu();
            }}
          >
            <span className="block text-[12.5px] font-semibold leading-none text-[var(--ctp-red)]">
              移除项目
            </span>
            <span className="text-[16px] leading-none text-[var(--ctp-red)]">⌫</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}

/**
 * 描述项目按钮组件的输入属性。
 */
interface ProjectButtonProps {
  project: Project;
  isActive: boolean;
  onActivate(projectId: string): void;
  onContextMenu(x: number, y: number): void;
}

/**
 * 渲染侧边栏项目入口。
 */
function ProjectButton({
  project,
  isActive,
  onActivate,
  onContextMenu,
}: ProjectButtonProps): ReactElement {
  const handleContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onContextMenu(event.clientX, event.clientY);
  };

  return (
    <button
      className={`flex min-h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-[7px] text-left text-[var(--ctp-text)] hover:bg-[var(--ctp-surface0)] ${
        isActive ? "bg-[var(--ctp-surface0)]" : "bg-transparent"
      }`}
      type="button"
      onClick={() => onActivate(project.id)}
      onContextMenu={handleContextMenu}
    >
      <span className="inline-grid size-6 flex-none place-items-center rounded-md bg-[var(--ctp-mauve)] text-xs font-extrabold text-[var(--ctp-base)]">
        {project.title.slice(0, 1).toUpperCase()}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold">
          {project.title}
        </span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold text-[var(--ctp-overlay2)]">
          primary
        </span>
      </span>
      <span className="ml-auto text-lg leading-none text-[var(--ctp-overlay2)]">›</span>
    </button>
  );
}

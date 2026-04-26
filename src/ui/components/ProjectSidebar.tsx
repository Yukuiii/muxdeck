import type { ReactElement } from "react";
import type { Project } from "../../domain/workspace";

/**
 * 描述项目侧边栏组件的输入属性。
 */
export interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId?: string;
  onAddProject(): Promise<void>;
  onActivateProject(projectId: string): void;
}

/**
 * 渲染项目列表和添加项目入口。
 */
export function ProjectSidebar({
  projects,
  activeProjectId,
  onAddProject,
  onActivateProject,
}: ProjectSidebarProps): ReactElement {
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
          />
        ))}
      </nav>
      <button
        className="mx-3 my-3 flex min-h-8 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-0.5 py-1 text-left text-[13px] leading-none font-[650] text-[var(--ctp-subtext0)] hover:text-[var(--ctp-text)]"
        type="button"
        onClick={() => {
          void onAddProject();
        }}
      >
        <span className="inline-grid size-6 flex-none place-items-center rounded-md bg-[var(--ctp-surface0)] text-[15px] text-[var(--ctp-lavender)]">
          +
        </span>
        <span>Add Project</span>
      </button>
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
}

/**
 * 渲染侧边栏项目入口。
 */
function ProjectButton({
  project,
  isActive,
  onActivate,
}: ProjectButtonProps): ReactElement {
  return (
    <button
      className={`flex min-h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-[7px] text-left text-[var(--ctp-text)] hover:bg-[var(--ctp-surface0)] ${
        isActive ? "bg-[var(--ctp-surface0)]" : "bg-transparent"
      }`}
      type="button"
      onClick={() => onActivate(project.id)}
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

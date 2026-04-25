import type { PointerEvent, ReactElement } from "react";
import type { Project } from "../../state/workspaceStore";

/**
 * 描述项目侧边栏组件的输入属性。
 */
export interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId?: string;
  onAddProject(): Promise<void>;
  onActivateProject(projectId: string): void;
  onResizeStart(event: PointerEvent<HTMLElement>): void;
}

/**
 * 渲染项目列表和添加项目入口。
 */
export function ProjectSidebar({
  projects,
  activeProjectId,
  onAddProject,
  onActivateProject,
  onResizeStart,
}: ProjectSidebarProps): ReactElement {
  return (
    <aside className="sidebar">
      <nav className="project-list" aria-label="项目">
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
        className="add-project-button"
        type="button"
        onClick={() => {
          void onAddProject();
        }}
      >
        <span className="add-project-icon">+</span>
        <span>Add Project</span>
      </button>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整项目栏宽度"
        onPointerDown={(event) => onResizeStart(event)}
      />
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
      className={`project-item${isActive ? " is-active" : ""}`}
      type="button"
      onClick={() => onActivate(project.id)}
    >
      <span className="project-icon">
        {project.title.slice(0, 1).toUpperCase()}
      </span>
      <span className="project-copy">
        <span className="project-title">{project.title}</span>
        <span className="project-meta">primary</span>
      </span>
      <span className="project-chevron">›</span>
    </button>
  );
}

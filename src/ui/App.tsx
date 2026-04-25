import type { CSSProperties, ReactElement } from "react";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { useResizableWidth } from "./hooks/useResizableWidth";
import { useWorkspaceTerminal } from "./hooks/useWorkspaceTerminal";

/**
 * 组合 Muxdeck 主界面的项目侧栏和终端区域。
 */
export function App(): ReactElement {
  const sidebarWidth = useResizableWidth({
    defaultWidth: 220,
    minWidth: 180,
    maxWidth: 360,
    edge: "right",
  });
  const {
    workspaceState,
    addProject,
    addTerminalTabToActiveProject,
    activateProject,
    activateTerminalTab,
    closeTerminalTab,
    setTerminalSurface,
  } = useWorkspaceTerminal();
  const activeProject = workspaceState.projects.find(
    (project) => project.id === workspaceState.activeProjectId,
  );
  const shellStyle = {
    "--sidebar-width": `${sidebarWidth.width}px`,
  } as CSSProperties;

  return (
    <main className="app-shell" style={shellStyle} aria-busy={!workspaceState.isReady}>
      <ProjectSidebar
        projects={workspaceState.projects}
        activeProjectId={workspaceState.activeProjectId}
        onAddProject={addProject}
        onActivateProject={activateProject}
        onResizeStart={sidebarWidth.startResize}
      />
      <TerminalPanel
        tabs={workspaceState.tabs}
        activeProjectId={workspaceState.activeProjectId}
        activeTabId={workspaceState.activeTabId}
        activeProjectCwd={activeProject?.cwd}
        onAddTerminalTab={addTerminalTabToActiveProject}
        onActivateTerminalTab={activateTerminalTab}
        onCloseTerminalTab={closeTerminalTab}
        onSurfaceRef={setTerminalSurface}
      />
    </main>
  );
}

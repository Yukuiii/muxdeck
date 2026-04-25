import type { ReactElement } from "react";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { TerminalPanel } from "./components/TerminalPanel";
import { useWorkspaceTerminal } from "./hooks/useWorkspaceTerminal";

/**
 * 组合 Muxdeck 主界面的项目侧栏和终端区域。
 */
export function App(): ReactElement {
  const {
    workspaceState,
    addProject,
    addTerminalTabToActiveProject,
    activateProject,
    activateTerminalTab,
    closeTerminalTab,
    setTerminalSurface,
  } = useWorkspaceTerminal();

  return (
    <main className="app-shell" aria-busy={!workspaceState.isReady}>
      <ProjectSidebar
        projects={workspaceState.projects}
        activeProjectId={workspaceState.activeProjectId}
        onAddProject={addProject}
        onActivateProject={activateProject}
      />
      <TerminalPanel
        tabs={workspaceState.tabs}
        activeProjectId={workspaceState.activeProjectId}
        activeTabId={workspaceState.activeTabId}
        onAddTerminalTab={addTerminalTabToActiveProject}
        onActivateTerminalTab={activateTerminalTab}
        onCloseTerminalTab={closeTerminalTab}
        onSurfaceRef={setTerminalSurface}
      />
    </main>
  );
}

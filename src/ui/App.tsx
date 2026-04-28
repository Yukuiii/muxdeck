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
    addTerminalTabToActiveWorktree,
    activateProject,
    activateWorktree,
    activateTerminalTab,
    createProjectWorktree,
    closeTerminalTab,
    removeProject,
    removeWorktreeFromApp,
    removeWorktree,
    requestActiveTerminalFit,
    setTerminalSurface,
  } = useWorkspaceTerminal();
  const activeWorktree = workspaceState.worktrees.find(
    (worktree) => worktree.id === workspaceState.activeWorktreeId,
  );

  return (
    <main className="app-shell" aria-busy={!workspaceState.isReady}>
      <ProjectSidebar
        projects={workspaceState.projects}
        worktrees={workspaceState.worktrees}
        activeProjectId={workspaceState.activeProjectId}
        activeWorktreeId={workspaceState.activeWorktreeId}
        onAddProject={addProject}
        onActivateProject={activateProject}
        onActivateWorktree={activateWorktree}
        onCreateWorktree={createProjectWorktree}
        onRemoveProject={removeProject}
        onRemoveWorktreeFromApp={removeWorktreeFromApp}
        onRemoveWorktree={removeWorktree}
      />
      <TerminalPanel
        tabs={workspaceState.tabs}
        activeWorktreeId={workspaceState.activeWorktreeId}
        activeTabId={workspaceState.activeTabId}
        activeWorktreeCwd={activeWorktree?.cwd}
        onAddTerminalTab={addTerminalTabToActiveWorktree}
        onActivateTerminalTab={activateTerminalTab}
        onCloseTerminalTab={closeTerminalTab}
        onRequestActiveTerminalFit={requestActiveTerminalFit}
        onSurfaceRef={setTerminalSurface}
      />
    </main>
  );
}

import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceStore, type TerminalTab } from "../../state/workspaceStore";
import { TerminalBridge } from "../../terminal/TerminalBridge";
import {
  type TerminalSize,
  XtermRenderer,
} from "../../terminal/XtermRenderer";
import type {
  TerminalExitPayload,
  TerminalOutputPayload,
} from "../../types/terminal";
import {
  createWorkspaceViewState,
  EMPTY_WORKSPACE_STATE,
  type WorkspaceViewState,
} from "../workspaceView";

/**
 * 记录单个终端标签对应的前端渲染器和后端会话状态。
 */
interface TerminalRuntime {
  renderer: XtermRenderer;
  backendSessionStarted: boolean;
  backendSessionStarting: boolean;
}

/**
 * 暴露给 React 组件层的 workspace 和终端操作。
 */
export interface WorkspaceTerminalController {
  workspaceState: WorkspaceViewState;
  addProject(): Promise<void>;
  addTerminalTabToActiveProject(): void;
  activateProject(projectId: string): void;
  activateTerminalTab(sessionId: string): void;
  closeTerminalTab(sessionId: string): void;
  setTerminalSurface(sessionId: string, element: HTMLDivElement | null): void;
}

/**
 * 管理 workspace store、终端桥接和 xterm 渲染器生命周期。
 */
export function useWorkspaceTerminal(): WorkspaceTerminalController {
  const [workspaceState, setWorkspaceState] = useState<WorkspaceViewState>(
    EMPTY_WORKSPACE_STATE,
  );
  const workspaceRef = useRef<WorkspaceStore | null>(null);
  const bridgeRef = useRef(new TerminalBridge());
  const terminalRuntimesRef = useRef(new Map<string, TerminalRuntime>());
  const terminalSurfacesRef = useRef(new Map<string, HTMLDivElement>());
  const closingTerminalIdsRef = useRef(new Set<string>());

  /**
   * 将可变 store 状态复制到 React 状态。
   */
  const refreshWorkspace = useCallback(() => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    setWorkspaceState(createWorkspaceViewState(workspace));
  }, []);

  /**
   * 同步指定终端标签页的 PTY 行列尺寸。
   */
  const resizeTerminalTab = useCallback(
    async (sessionId: string, size: TerminalSize) => {
      const workspace = workspaceRef.current;
      const tab = workspace?.getTab(sessionId);

      if (!tab || tab.status !== "running") {
        return;
      }

      try {
        await bridgeRef.current.resize({
          sessionId,
          rows: size.rows,
          cols: size.cols,
        });
      } catch (error) {
        console.error("Failed to resize terminal session", error);
      }
    },
    [],
  );

  /**
   * 关闭后端 PTY 会话并释放关闭锁。
   */
  const closeBackendSession = useCallback((sessionId: string) => {
    void bridgeRef.current
      .closeSession(sessionId)
      .catch((error) => {
        console.error("Failed to close terminal session", error);
      })
      .finally(() => {
        closingTerminalIdsRef.current.delete(sessionId);
      });
  }, []);

  /**
   * 为当前可见终端标签创建 xterm 渲染器和后端 PTY 会话。
   */
  const ensureTerminalRuntime = useCallback(
    async (tab: TerminalTab) => {
      const sessionId = tab.id;
      const existingRuntime = terminalRuntimesRef.current.get(sessionId);

      if (existingRuntime) {
        existingRuntime.renderer.fit();
        existingRuntime.renderer.focus();
        return;
      }

      const surface = terminalSurfacesRef.current.get(sessionId);
      const workspace = workspaceRef.current;

      if (!surface || !workspace) {
        return;
      }

      const renderer = new XtermRenderer(
        surface,
        (data) => {
          void bridgeRef.current.writeInput({ sessionId, data });
        },
        (size) => {
          void resizeTerminalTab(sessionId, size);
        },
      );
      const runtime: TerminalRuntime = {
        renderer,
        backendSessionStarted: false,
        backendSessionStarting: true,
      };

      terminalRuntimesRef.current.set(sessionId, runtime);
      await waitForLayoutFrame();

      // 终端必须在活动 surface 可见后挂载，否则 xterm 会得到错误尺寸。
      if (
        workspaceRef.current?.getActiveTabId() !== sessionId ||
        closingTerminalIdsRef.current.has(sessionId) ||
        !terminalRuntimesRef.current.has(sessionId)
      ) {
        terminalRuntimesRef.current.delete(sessionId);
        closingTerminalIdsRef.current.delete(sessionId);
        renderer.dispose();
        return;
      }

      const initialSize = renderer.mount();

      try {
        await bridgeRef.current.createSession({
          sessionId,
          cwd: tab.cwd,
          rows: initialSize.rows,
          cols: initialSize.cols,
        });
      } catch (error) {
        runtime.backendSessionStarting = false;

        if (
          closingTerminalIdsRef.current.has(sessionId) ||
          !terminalRuntimesRef.current.has(sessionId)
        ) {
          closingTerminalIdsRef.current.delete(sessionId);
          return;
        }

        workspaceRef.current?.setTerminalStatus(sessionId, "exited");
        refreshWorkspace();
        console.error("Failed to create terminal session", error);
        return;
      }

      runtime.backendSessionStarting = false;
      runtime.backendSessionStarted = true;

      if (
        closingTerminalIdsRef.current.has(sessionId) ||
        !terminalRuntimesRef.current.has(sessionId)
      ) {
        closeBackendSession(sessionId);
        return;
      }

      workspaceRef.current?.setTerminalStatus(sessionId, "running");
      refreshWorkspace();

      if (workspaceRef.current?.getActiveTabId() === sessionId) {
        renderer.fit();
        renderer.focus();
      }
    },
    [closeBackendSession, refreshWorkspace, resizeTerminalTab],
  );

  /**
   * 选择项目目录并创建或激活项目工作区。
   */
  const addProject = useCallback(async () => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const selected = await open({
      canCreateDirectories: true,
      directory: true,
      multiple: false,
      title: "Add Project",
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    const existingProject = workspace.findProjectByCwd(selected);

    if (existingProject) {
      workspace.activateProject(existingProject.id);
      refreshWorkspace();
      return;
    }

    const project = workspace.createProject(selected);
    workspace.createTerminalTab(project.id);
    refreshWorkspace();
  }, [refreshWorkspace]);

  /**
   * 在当前项目中创建一个新的终端标签页。
   */
  const addTerminalTabToActiveProject = useCallback(() => {
    const workspace = workspaceRef.current;
    const activeProjectId = workspace?.getActiveProjectId();

    if (!workspace || !activeProjectId) {
      return;
    }

    workspace.createTerminalTab(activeProjectId);
    refreshWorkspace();
  }, [refreshWorkspace]);

  /**
   * 激活指定项目并显示该项目的终端标签。
   */
  const activateProject = useCallback(
    (projectId: string) => {
      workspaceRef.current?.activateProject(projectId);
      refreshWorkspace();
    },
    [refreshWorkspace],
  );

  /**
   * 激活指定终端标签页。
   */
  const activateTerminalTab = useCallback(
    (sessionId: string) => {
      workspaceRef.current?.activateTerminalTab(sessionId);
      refreshWorkspace();
    },
    [refreshWorkspace],
  );

  /**
   * 关闭指定终端标签页并释放对应 PTY 会话。
   */
  const closeTerminalTab = useCallback(
    (sessionId: string) => {
      const workspace = workspaceRef.current;

      if (!workspace || closingTerminalIdsRef.current.has(sessionId)) {
        return;
      }

      const tab = workspace.getTab(sessionId);

      if (!tab) {
        return;
      }

      closingTerminalIdsRef.current.add(sessionId);
      const runtime = terminalRuntimesRef.current.get(sessionId);
      terminalRuntimesRef.current.delete(sessionId);

      try {
        runtime?.renderer.dispose();
      } catch (error) {
        console.error("Failed to dispose terminal renderer", error);
      }

      workspace.removeTerminalTab(sessionId);
      refreshWorkspace();

      if (runtime?.backendSessionStarted) {
        closeBackendSession(sessionId);
        return;
      }

      if (!runtime?.backendSessionStarting) {
        closingTerminalIdsRef.current.delete(sessionId);
      }
    },
    [closeBackendSession, refreshWorkspace],
  );

  /**
   * 按 sessionId 将后端输出分发到对应终端渲染器。
   */
  const handleTerminalOutput = useCallback((payload: TerminalOutputPayload) => {
    const runtime = terminalRuntimesRef.current.get(payload.sessionId);
    runtime?.renderer.write(new Uint8Array(payload.data));
  }, []);

  /**
   * 标记终端会话退出并更新标签状态。
   */
  const handleTerminalExit = useCallback(
    (payload: TerminalExitPayload) => {
      if (closingTerminalIdsRef.current.has(payload.sessionId)) {
        return;
      }

      const runtime = terminalRuntimesRef.current.get(payload.sessionId);

      if (!runtime) {
        return;
      }

      workspaceRef.current?.setTerminalStatus(payload.sessionId, "exited");
      refreshWorkspace();
    },
    [refreshWorkspace],
  );

  /**
   * 保存或清理终端 surface DOM 引用。
   */
  const setTerminalSurface = useCallback(
    (sessionId: string, element: HTMLDivElement | null) => {
      if (!element) {
        terminalSurfacesRef.current.delete(sessionId);
        return;
      }

      terminalSurfacesRef.current.set(sessionId, element);
    },
    [],
  );

  /**
   * 启动 workspace store 和终端事件桥接。
   */
  useEffect(() => {
    let disposed = false;

    void (async () => {
      const workspace = await WorkspaceStore.create();

      if (disposed) {
        return;
      }

      workspaceRef.current = workspace;
      await bridgeRef.current.start(handleTerminalOutput, handleTerminalExit);

      if (disposed) {
        bridgeRef.current.stop();
        return;
      }

      refreshWorkspace();
    })();

    return () => {
      disposed = true;
      bridgeRef.current.stop();

      for (const runtime of terminalRuntimesRef.current.values()) {
        runtime.renderer.dispose();
      }

      terminalRuntimesRef.current.clear();
    };
  }, [handleTerminalExit, handleTerminalOutput, refreshWorkspace]);

  /**
   * 在活动标签可见后创建或聚焦对应终端实例。
   */
  useEffect(() => {
    const activeTab = workspaceState.tabs.find(
      (tab) => tab.id === workspaceState.activeTabId,
    );

    if (!activeTab) {
      return;
    }

    void ensureTerminalRuntime(activeTab);
  }, [ensureTerminalRuntime, workspaceState.activeTabId, workspaceState.tabs]);

  return {
    workspaceState,
    addProject,
    addTerminalTabToActiveProject,
    activateProject,
    activateTerminalTab,
    closeTerminalTab,
    setTerminalSurface,
  };
}

/**
 * 等待浏览器完成一次布局，确保终端在可见容器中计算尺寸。
 */
function waitForLayoutFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createApplicationError,
  normalizeApplicationError,
  type ApplicationError,
} from "../../application/errors";
import { applicationServices } from "../../application/services";
import type { GitDiffResult, GitPanelState } from "../../types/gitPanel";

interface GitPanelViewState {
  data?: GitPanelState;
  error?: ApplicationError;
  isCommitting: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  isStaging: boolean;
  isUnstaging: boolean;
}

const EMPTY_GIT_PANEL_STATE: GitPanelViewState = {
  isCommitting: false,
  isLoading: false,
  isSyncing: false,
  isStaging: false,
  isUnstaging: false,
};

/**
 * 按项目目录加载右侧 Git 面板数据。
 */
export function useGitPanel(cwd?: string, isOpen = false): GitPanelViewState & {
  commitStagedChanges(message: string): Promise<boolean>;
  loadAllDiffs(staged: boolean): Promise<GitDiffResult | undefined>;
  loadFileDiff(path: string, staged: boolean): Promise<GitDiffResult | undefined>;
  syncCurrentBranch(): Promise<boolean>;
  refresh(): void;
  stageFile(path: string): Promise<boolean>;
  stageUnstagedChanges(): Promise<boolean>;
  unstageAll(): Promise<boolean>;
  unstageFile(path: string): Promise<boolean>;
} {
  const [state, setState] = useState<GitPanelViewState>(EMPTY_GIT_PANEL_STATE);
  const latestRequestIdRef = useRef(0);
  const panelCacheRef = useRef(new Map<string, GitPanelState>());
  const servicesRef = useRef(applicationServices);

  /**
   * 从 Tauri 后端刷新 Git 面板数据。
   */
  const refresh = useCallback(() => {
    if (!cwd || !isOpen) {
      latestRequestIdRef.current += 1;
      setState(EMPTY_GIT_PANEL_STATE);
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    const requestCwd = cwd;
    const cachedData = panelCacheRef.current.get(requestCwd);

    latestRequestIdRef.current = requestId;
    setState((current) => ({
      ...current,
      // 优先复用当前项目缓存数据，避免切换项目时先清空再闪烁。
      data: cachedData,
      error: undefined,
      isLoading: !cachedData,
    }));

    void servicesRef.current.gitPanelGateway
      .loadPanel({ cwd: requestCwd })
      .then((data) => {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        panelCacheRef.current.set(requestCwd, data);
        setState((current) => ({
          ...current,
          data,
          error: undefined,
          isLoading: false,
        }));
      })
      .catch((error: unknown) => {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        const normalizedError = normalizeApplicationError(error);
        const fallbackData = panelCacheRef.current.get(requestCwd);

        setState((current) => ({
          ...current,
          data: fallbackData,
          error: normalizedError,
          isLoading: false,
        }));
      });
  }, [cwd, isOpen]);

  /**
   * 确认后使用暂存区创建 Git commit。
   */
  const commitStagedChanges = useCallback(
    async (message: string): Promise<boolean> => {
      const normalizedMessage = message.trim();

      if (!cwd || !normalizedMessage) {
        return false;
      }

      if (!state.data?.stagedChanges.length) {
        setState((current) => ({
          ...current,
          error: createApplicationError(
            "VALIDATION_FAILED",
            "No staged changes to commit.",
          ),
        }));
        return false;
      }

      const confirmed =
        await servicesRef.current.confirmationDialog.confirmGitCommit(
          normalizedMessage,
        );

      if (!confirmed) {
        return false;
      }

      setState((current) => ({
        ...current,
        error: undefined,
        isCommitting: true,
      }));

      try {
        await servicesRef.current.gitPanelGateway.commitStagedChanges({
          cwd,
          message: normalizedMessage,
        });
        refresh();
        return true;
      } catch (error) {
        const normalizedError = normalizeApplicationError(error);

        setState((current) => ({
          ...current,
          error: normalizedError,
        }));
        return false;
      } finally {
        setState((current) => ({
          ...current,
          isCommitting: false,
        }));
      }
    },
    [cwd, refresh, state.data?.stagedChanges.length],
  );

  /**
   * 确认后将当前分支与远端仓库同步。
   */
  const syncCurrentBranch = useCallback(async (): Promise<boolean> => {
    const branch = state.data?.branch?.trim();
    const syncStatus = state.data?.syncStatus;

    if (!cwd || !branch || !syncStatus?.canSync) {
      return false;
    }

    if (syncStatus.hasUpstream && syncStatus.ahead === 0 && syncStatus.behind === 0) {
      setState((current) => ({
        ...current,
        error: createApplicationError(
          "VALIDATION_FAILED",
          "No incoming or outgoing commits to sync.",
        ),
      }));
      return false;
    }

    const confirmed = await servicesRef.current.confirmationDialog.confirmGitSync(branch);

    if (!confirmed) {
      return false;
    }

    setState((current) => ({
      ...current,
      error: undefined,
      isSyncing: true,
    }));

    try {
      await servicesRef.current.gitPanelGateway.syncCurrentBranch({ cwd });
      refresh();
      return true;
    } catch (error) {
      const normalizedError = normalizeApplicationError(error);

      setState((current) => ({
        ...current,
        error: normalizedError,
      }));
      return false;
    } finally {
      setState((current) => ({
        ...current,
        isSyncing: false,
      }));
    }
  }, [cwd, refresh, state.data?.branch, state.data?.syncStatus]);

  /**
   * 将当前工作区所有未暂存变更加入暂存区。
   */
  const stageUnstagedChanges = useCallback(async (): Promise<boolean> => {
    if (!cwd) {
      return false;
    }

    if (!state.data?.unstagedChanges.length) {
      setState((current) => ({
        ...current,
        error: createApplicationError(
          "VALIDATION_FAILED",
          "No unstaged changes to stage.",
        ),
      }));
      return false;
    }

    setState((current) => ({
      ...current,
      error: undefined,
      isStaging: true,
    }));

    try {
      await servicesRef.current.gitPanelGateway.stageUnstagedChanges({ cwd });
      refresh();
      return true;
    } catch (error) {
      const normalizedError = normalizeApplicationError(error);

      setState((current) => ({
        ...current,
        error: normalizedError,
      }));
      return false;
    } finally {
      setState((current) => ({
        ...current,
        isStaging: false,
      }));
    }
  }, [cwd, refresh, state.data?.unstagedChanges.length]);

  /**
   * 将指定未暂存文件加入暂存区。
   */
  const stageFile = useCallback(
    async (path: string): Promise<boolean> => {
      const normalizedPath = path.trim();

      if (!cwd || !normalizedPath) {
        return false;
      }

      const hasTargetFile = Boolean(
        state.data?.unstagedChanges.some((change) => change.path === normalizedPath),
      );

      if (!hasTargetFile) {
        setState((current) => ({
          ...current,
          error: createApplicationError(
            "VALIDATION_FAILED",
            "Target file is not in unstaged changes.",
          ),
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        error: undefined,
        isStaging: true,
      }));

      try {
        await servicesRef.current.gitPanelGateway.stageFile({
          cwd,
          path: normalizedPath,
        });
        refresh();
        return true;
      } catch (error) {
        const normalizedError = normalizeApplicationError(error);

        setState((current) => ({
          ...current,
          error: normalizedError,
        }));
        return false;
      } finally {
        setState((current) => ({
          ...current,
          isStaging: false,
        }));
      }
    },
    [cwd, refresh, state.data?.unstagedChanges],
  );

  /**
   * 将当前工作区所有已暂存变更移回未暂存区。
   */
  const unstageAll = useCallback(async (): Promise<boolean> => {
    if (!cwd) {
      return false;
    }

    if (!state.data?.stagedChanges.length) {
      setState((current) => ({
        ...current,
        error: createApplicationError(
          "VALIDATION_FAILED",
          "No staged changes to unstage.",
        ),
      }));
      return false;
    }

    setState((current) => ({
      ...current,
      error: undefined,
      isUnstaging: true,
    }));

    try {
      await servicesRef.current.gitPanelGateway.unstageAll({ cwd });
      refresh();
      return true;
    } catch (error) {
      const normalizedError = normalizeApplicationError(error);

      setState((current) => ({
        ...current,
        error: normalizedError,
      }));
      return false;
    } finally {
      setState((current) => ({
        ...current,
        isUnstaging: false,
      }));
    }
  }, [cwd, refresh, state.data?.stagedChanges.length]);

  /**
   * 将指定已暂存文件移回未暂存区。
   */
  const unstageFile = useCallback(
    async (path: string): Promise<boolean> => {
      const normalizedPath = path.trim();

      if (!cwd || !normalizedPath) {
        return false;
      }

      const hasTargetFile = Boolean(
        state.data?.stagedChanges.some((change) => change.path === normalizedPath),
      );

      if (!hasTargetFile) {
        setState((current) => ({
          ...current,
          error: createApplicationError(
            "VALIDATION_FAILED",
            "Target file is not in staged changes.",
          ),
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        error: undefined,
        isUnstaging: true,
      }));

      try {
        await servicesRef.current.gitPanelGateway.unstageFile({
          cwd,
          path: normalizedPath,
        });
        refresh();
        return true;
      } catch (error) {
        const normalizedError = normalizeApplicationError(error);

        setState((current) => ({
          ...current,
          error: normalizedError,
        }));
        return false;
      } finally {
        setState((current) => ({
          ...current,
          isUnstaging: false,
        }));
      }
    },
    [cwd, refresh, state.data?.stagedChanges],
  );

  /**
   * 加载暂存区或工作区中全部文件的 diff 内容。
   */
  const loadAllDiffs = useCallback(
    async (staged: boolean): Promise<GitDiffResult | undefined> => {
      if (!cwd) {
        return undefined;
      }

      try {
        const diff = await servicesRef.current.gitPanelGateway.loadAllDiffs({
          cwd,
          staged,
        });
        setState((current) => ({
          ...current,
          error: undefined,
        }));
        return diff;
      } catch (error) {
        const normalizedError = normalizeApplicationError(error);
        setState((current) => ({
          ...current,
          error: normalizedError,
        }));
        return undefined;
      }
    },
    [cwd],
  );

  /**
   * 加载指定文件的 diff 文本内容。
   */
  const loadFileDiff = useCallback(
    async (path: string, staged: boolean): Promise<GitDiffResult | undefined> => {
      const normalizedPath = path.trim();

      if (!cwd || !normalizedPath) {
        return undefined;
      }

      try {
        const diff = await servicesRef.current.gitPanelGateway.loadFileDiff({
          cwd,
          path: normalizedPath,
          staged,
        });
        setState((current) => ({
          ...current,
          error: undefined,
        }));
        return diff;
      } catch (error) {
        const normalizedError = normalizeApplicationError(error);
        setState((current) => ({
          ...current,
          error: normalizedError,
        }));
        return undefined;
      }
    },
    [cwd],
  );

  /**
   * 在面板打开或项目切换时自动刷新 Git 数据。
   */
  useEffect(() => {
    // 让项目切换先完成渲染，再异步触发 Git 数据加载。
    const timerId = window.setTimeout(() => {
      refresh();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [refresh]);

  /**
   * 面板打开期间每 10 秒刷新一次 Git 数据。
   */
  useEffect(() => {
    if (!cwd || !isOpen) {
      return;
    }

    const intervalId = window.setInterval(refresh, 10_000);

    return () => window.clearInterval(intervalId);
  }, [cwd, isOpen, refresh]);

  return {
    ...state,
    commitStagedChanges,
    loadAllDiffs,
    loadFileDiff,
    syncCurrentBranch,
    refresh,
    stageFile,
    stageUnstagedChanges,
    unstageAll,
    unstageFile,
  };
}

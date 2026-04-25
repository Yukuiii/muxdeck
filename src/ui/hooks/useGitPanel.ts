import { useCallback, useEffect, useRef, useState } from "react";
import {
  createApplicationError,
  normalizeApplicationError,
  type ApplicationError,
} from "../../application/errors";
import { applicationServices } from "../../application/services";
import type { GitPanelState } from "../../types/gitPanel";

interface GitPanelViewState {
  data?: GitPanelState;
  error?: ApplicationError;
  isCommitting: boolean;
  isLoading: boolean;
  isStaging: boolean;
}

const EMPTY_GIT_PANEL_STATE: GitPanelViewState = {
  isCommitting: false,
  isLoading: false,
  isStaging: false,
};

/**
 * 按项目目录加载右侧 Git 面板数据。
 */
export function useGitPanel(cwd?: string, isOpen = false): GitPanelViewState & {
  commitStagedChanges(message: string): Promise<boolean>;
  refresh(): void;
  stageUnstagedChanges(): Promise<boolean>;
} {
  const [state, setState] = useState<GitPanelViewState>(EMPTY_GIT_PANEL_STATE);
  const latestRequestIdRef = useRef(0);
  const loadedCwdRef = useRef<string | undefined>(undefined);
  const servicesRef = useRef(applicationServices);

  /**
   * 从 Tauri 后端刷新 Git 面板数据。
   */
  const refresh = useCallback(() => {
    if (!cwd || !isOpen) {
      latestRequestIdRef.current += 1;
      loadedCwdRef.current = undefined;
      setState(EMPTY_GIT_PANEL_STATE);
      return;
    }

    const requestId = latestRequestIdRef.current + 1;
    const requestCwd = cwd;
    const shouldResetData = loadedCwdRef.current !== requestCwd;

    latestRequestIdRef.current = requestId;
    setState((current) => ({
      ...current,
      data: shouldResetData ? undefined : current.data,
      error: undefined,
      isLoading: shouldResetData || !current.data,
    }));

    void servicesRef.current.gitPanelGateway
      .loadPanel({ cwd: requestCwd })
      .then((data) => {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }

        loadedCwdRef.current = requestCwd;
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

        setState((current) => ({
          ...current,
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
   * 在面板打开或项目切换时自动刷新 Git 数据。
   */
  useEffect(() => {
    refresh();
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
    refresh,
    stageUnstagedChanges,
  };
}

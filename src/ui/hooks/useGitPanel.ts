import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitCommitResult, GitPanelState } from "../../types/gitPanel";

interface GitPanelViewState {
  data?: GitPanelState;
  error?: string;
  isCommitting: boolean;
  isLoading: boolean;
}

const EMPTY_GIT_PANEL_STATE: GitPanelViewState = {
  isCommitting: false,
  isLoading: false,
};

/**
 * 按项目目录加载右侧 Git 面板数据。
 */
export function useGitPanel(cwd?: string, isOpen = false): GitPanelViewState & {
  commitStagedChanges(message: string): Promise<boolean>;
  refresh(): void;
} {
  const [state, setState] = useState<GitPanelViewState>(EMPTY_GIT_PANEL_STATE);
  const isRefreshingRef = useRef(false);

  /**
   * 从 Tauri 后端刷新 Git 面板数据。
   */
  const refresh = useCallback(() => {
    if (!cwd || !isOpen) {
      setState(EMPTY_GIT_PANEL_STATE);
      return;
    }

    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setState((current) => ({
      ...current,
      error: undefined,
      isLoading: !current.data,
    }));

    void invoke<GitPanelState>("load_git_panel", { request: { cwd } })
      .then((data) => {
        setState((current) => ({
          ...current,
          data,
          error: undefined,
          isLoading: false,
        }));
      })
      .catch((error: unknown) => {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        }));
      })
      .finally(() => {
        isRefreshingRef.current = false;
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
          error: "No staged changes to commit.",
        }));
        return false;
      }

      const confirmed = await confirm(
        `Create a git commit with message:\n\n${normalizedMessage}`,
        {
          title: "Confirm Git Commit",
          kind: "warning",
          okLabel: "Commit",
          cancelLabel: "Cancel",
        },
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
        await invoke<GitCommitResult>("commit_staged_git_changes", {
          request: { cwd, message: normalizedMessage },
        });
        refresh();
        return true;
      } catch (error) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : String(error),
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
  };
}

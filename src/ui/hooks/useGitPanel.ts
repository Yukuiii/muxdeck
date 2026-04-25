import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import type { GitPanelState } from "../../types/gitPanel";

interface GitPanelViewState {
  data?: GitPanelState;
  error?: string;
  isLoading: boolean;
}

const EMPTY_GIT_PANEL_STATE: GitPanelViewState = {
  isLoading: false,
};

/**
 * 按项目目录加载右侧 Git 面板数据。
 */
export function useGitPanel(cwd?: string, isOpen = false): GitPanelViewState & {
  refresh(): void;
} {
  const [state, setState] = useState<GitPanelViewState>(EMPTY_GIT_PANEL_STATE);

  /**
   * 从 Tauri 后端刷新 Git 面板数据。
   */
  const refresh = useCallback(() => {
    if (!cwd || !isOpen) {
      setState(EMPTY_GIT_PANEL_STATE);
      return;
    }

    setState((current) => ({ ...current, error: undefined, isLoading: true }));

    void invoke<GitPanelState>("load_git_panel", { request: { cwd } })
      .then((data) => {
        setState({ data, isLoading: false });
      })
      .catch((error: unknown) => {
        setState({
          error: error instanceof Error ? error.message : String(error),
          isLoading: false,
        });
      });
  }, [cwd, isOpen]);

  /**
   * 在面板打开或项目切换时自动刷新 Git 数据。
   */
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeApplicationError,
  type ApplicationError,
} from "../../application/errors";
import { applicationServices } from "../../application/services";
import type {
  ProjectDirectoryEntry,
  ProjectFileResult,
} from "../../types/projectExplorer";

interface ProjectExplorerViewState {
  entriesByDirectory: Record<string, ProjectDirectoryEntry[]>;
  error?: ApplicationError;
  expandedDirectories: string[];
  isLoadingRoot: boolean;
  loadingDirectories: string[];
  openingFilePath?: string;
}

const EMPTY_PROJECT_EXPLORER_STATE: ProjectExplorerViewState = {
  entriesByDirectory: {},
  expandedDirectories: [],
  isLoadingRoot: false,
  loadingDirectories: [],
};

/**
 * 按项目目录加载右侧文件树并暴露目录展开、文件读取能力。
 */
export function useProjectExplorer(cwd?: string, isOpen = false): ProjectExplorerViewState & {
  openFile(path: string): Promise<ProjectFileResult | undefined>;
  refresh(): void;
  toggleDirectory(path: string): void;
} {
  const [state, setState] = useState<ProjectExplorerViewState>(
    EMPTY_PROJECT_EXPLORER_STATE,
  );
  const directoryCacheRef = useRef(new Map<string, ProjectDirectoryEntry[]>());
  const servicesRef = useRef(applicationServices);

  /**
   * 在项目切换时清空目录缓存和展开状态，避免跨项目串数据。
   */
  useEffect(() => {
    directoryCacheRef.current.clear();
    setState(EMPTY_PROJECT_EXPLORER_STATE);
  }, [cwd]);

  /**
   * 读取指定目录下的直接子项。
   */
  const loadDirectory = useCallback(
    async (path = "", forceRefresh = false): Promise<void> => {
      if (!cwd) {
        return;
      }

      const cachedEntries = directoryCacheRef.current.get(path);

      if (cachedEntries && !forceRefresh) {
        setState((current) => ({
          ...current,
          entriesByDirectory: {
            ...current.entriesByDirectory,
            [path]: cachedEntries,
          },
          error: undefined,
          isLoadingRoot: path === "" ? false : current.isLoadingRoot,
          loadingDirectories: current.loadingDirectories.filter(
            (loadingPath) => loadingPath !== path,
          ),
        }));
        return;
      }

      setState((current) => ({
        ...current,
        error: undefined,
        isLoadingRoot: path === "" ? true : current.isLoadingRoot,
        loadingDirectories:
          path === "" || current.loadingDirectories.includes(path)
            ? current.loadingDirectories
            : [...current.loadingDirectories, path],
      }));

      try {
        const result = await servicesRef.current.projectExplorerGateway.loadDirectory({
          cwd,
          path: path || undefined,
        });

        directoryCacheRef.current.set(path, result.entries);
        setState((current) => ({
          ...current,
          entriesByDirectory: {
            ...current.entriesByDirectory,
            [path]: result.entries,
          },
          error: undefined,
          isLoadingRoot: path === "" ? false : current.isLoadingRoot,
          loadingDirectories: current.loadingDirectories.filter(
            (loadingPath) => loadingPath !== path,
          ),
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          error: normalizeApplicationError(error),
          isLoadingRoot: path === "" ? false : current.isLoadingRoot,
          loadingDirectories: current.loadingDirectories.filter(
            (loadingPath) => loadingPath !== path,
          ),
        }));
      }
    },
    [cwd],
  );

  /**
   * 打开目录节点时按需加载其子项，关闭时仅折叠节点。
   */
  const toggleDirectory = useCallback(
    (path: string) => {
      const cachedEntries = directoryCacheRef.current.get(path);

      setState((current) => {
        const isExpanded = current.expandedDirectories.includes(path);

        return {
          ...current,
          expandedDirectories: isExpanded
            ? current.expandedDirectories.filter((directoryPath) => directoryPath !== path)
            : [...current.expandedDirectories, path],
        };
      });

      if (!cachedEntries) {
        void loadDirectory(path);
      }
    },
    [loadDirectory],
  );

  /**
   * 读取指定文件内容，供主区新标签页展示。
   */
  const openFile = useCallback(
    async (path: string): Promise<ProjectFileResult | undefined> => {
      const normalizedPath = path.trim();

      if (!cwd || !normalizedPath) {
        return undefined;
      }

      setState((current) => ({
        ...current,
        error: undefined,
        openingFilePath: normalizedPath,
      }));

      try {
        const result = await servicesRef.current.projectExplorerGateway.readFile({
          cwd,
          path: normalizedPath,
        });
        setState((current) => ({
          ...current,
          error: undefined,
          openingFilePath:
            current.openingFilePath === normalizedPath
              ? undefined
              : current.openingFilePath,
        }));
        return result;
      } catch (error) {
        setState((current) => ({
          ...current,
          error: normalizeApplicationError(error),
          openingFilePath:
            current.openingFilePath === normalizedPath
              ? undefined
              : current.openingFilePath,
        }));
        return undefined;
      }
    },
    [cwd],
  );

  /**
   * 强制刷新根目录列表，并清空已缓存的展开数据。
   */
  const refresh = useCallback(() => {
    if (!cwd || !isOpen) {
      setState(EMPTY_PROJECT_EXPLORER_STATE);
      return;
    }

    directoryCacheRef.current.clear();
    setState((current) => ({
      ...EMPTY_PROJECT_EXPLORER_STATE,
      openingFilePath: current.openingFilePath,
    }));
    void loadDirectory("", true);
  }, [cwd, isOpen, loadDirectory]);

  /**
   * 文件树面板打开后自动加载根目录。
   */
  useEffect(() => {
    if (!cwd || !isOpen) {
      return;
    }

    if (directoryCacheRef.current.has("")) {
      setState((current) => ({
        ...current,
        entriesByDirectory: {
          ...current.entriesByDirectory,
          "": directoryCacheRef.current.get("") ?? [],
        },
      }));
      return;
    }

    void loadDirectory("", true);
  }, [cwd, isOpen, loadDirectory]);

  return {
    ...state,
    openFile,
    refresh,
    toggleDirectory,
  };
}

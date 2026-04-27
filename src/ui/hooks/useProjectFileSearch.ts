import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeApplicationError,
  type ApplicationError,
} from "../../application/errors";
import { applicationServices } from "../../application/services";

interface ProjectFileSearchState {
  error?: ApplicationError;
  isLoading: boolean;
  paths: string[];
}

const EMPTY_PROJECT_FILE_SEARCH_STATE: ProjectFileSearchState = {
  isLoading: false,
  paths: [],
};

/**
 * 按项目目录缓存并加载全量文件路径，供快速打开浮层使用。
 */
export function useProjectFileSearch(cwd?: string): ProjectFileSearchState & {
  loadFiles(forceRefresh?: boolean): Promise<string[] | undefined>;
} {
  const [state, setState] = useState<ProjectFileSearchState>(
    EMPTY_PROJECT_FILE_SEARCH_STATE,
  );
  const fileListCacheRef = useRef(new Map<string, string[]>());
  const servicesRef = useRef(applicationServices);

  /**
   * 在项目切换时重置当前显示状态，但保留跨项目缓存。
   */
  useEffect(() => {
    if (!cwd) {
      setState(EMPTY_PROJECT_FILE_SEARCH_STATE);
      return;
    }

    setState({
      error: undefined,
      isLoading: false,
      paths: fileListCacheRef.current.get(cwd) ?? [],
    });
  }, [cwd]);

  /**
   * 加载当前项目下的全量文件路径，并在内存中缓存。
   */
  const loadFiles = useCallback(
    async (forceRefresh = false): Promise<string[] | undefined> => {
      if (!cwd) {
        return undefined;
      }

      const cachedPaths = fileListCacheRef.current.get(cwd);

      if (cachedPaths && !forceRefresh) {
        setState({
          error: undefined,
          isLoading: false,
          paths: cachedPaths,
        });
        return cachedPaths;
      }

      setState((current) => ({
        ...current,
        error: undefined,
        isLoading: true,
      }));

      try {
        const result = await servicesRef.current.projectExplorerGateway.listFiles({ cwd });
        fileListCacheRef.current.set(cwd, result.paths);
        setState({
          error: undefined,
          isLoading: false,
          paths: result.paths,
        });
        return result.paths;
      } catch (error) {
        setState((current) => ({
          ...current,
          error: normalizeApplicationError(error),
          isLoading: false,
        }));
        return undefined;
      }
    },
    [cwd],
  );

  return {
    ...state,
    loadFiles,
  };
}

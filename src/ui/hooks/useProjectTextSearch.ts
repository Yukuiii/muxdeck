import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeApplicationError,
  type ApplicationError,
} from "../../application/errors";
import { applicationServices } from "../../application/services";
import type { ProjectTextSearchResult } from "../../types/projectExplorer";

const TEXT_SEARCH_DEBOUNCE_MS = 260;
const TEXT_SEARCH_RESULT_LIMIT = 500;

interface ProjectTextSearchState {
  error?: ApplicationError;
  isSearching: boolean;
  result?: ProjectTextSearchResult;
}

const EMPTY_PROJECT_TEXT_SEARCH_STATE: ProjectTextSearchState = {
  isSearching: false,
};

/**
 * 按项目目录维护全文搜索输入、异步请求和过期请求保护。
 */
export function useProjectTextSearch(cwd?: string): ProjectTextSearchState & {
  query: string;
  clear(): void;
  setQuery(query: string): void;
} {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ProjectTextSearchState>(
    EMPTY_PROJECT_TEXT_SEARCH_STATE,
  );
  const requestIdRef = useRef(0);
  const servicesRef = useRef(applicationServices);

  /**
   * 在项目切换时重置搜索输入和结果，避免跨项目串数据。
   */
  useEffect(() => {
    requestIdRef.current += 1;
    setQuery("");
    setState(EMPTY_PROJECT_TEXT_SEARCH_STATE);
  }, [cwd]);

  /**
   * 清空当前搜索输入和结果。
   */
  const clear = useCallback(() => {
    requestIdRef.current += 1;
    setQuery("");
    setState(EMPTY_PROJECT_TEXT_SEARCH_STATE);
  }, []);

  /**
   * 查询变化后延迟触发全文搜索，降低高频键入时的后端压力。
   */
  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!cwd || !normalizedQuery) {
      requestIdRef.current += 1;
      setState(EMPTY_PROJECT_TEXT_SEARCH_STATE);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((current) => ({
      error: undefined,
      isSearching: true,
      result:
        current.result?.query === normalizedQuery ? current.result : undefined,
    }));

    const timer = window.setTimeout(() => {
      void servicesRef.current.projectExplorerGateway
        .searchText({
          cwd,
          query: normalizedQuery,
          maxResults: TEXT_SEARCH_RESULT_LIMIT,
        })
        .then((result) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setState({
            error: undefined,
            isSearching: false,
            result,
          });
        })
        .catch((error) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setState({
            error: normalizeApplicationError(error),
            isSearching: false,
          });
        });
    }, TEXT_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [cwd, query]);

  return {
    ...state,
    clear,
    query,
    setQuery,
  };
}

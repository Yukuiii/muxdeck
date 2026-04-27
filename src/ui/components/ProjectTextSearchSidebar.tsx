import { Search, X } from "lucide-react";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ApplicationError } from "../../application/errors";
import type {
  ProjectTextSearchLineMatch,
  ProjectTextSearchResult,
} from "../../types/projectExplorer";
import { fileDirectoryFromPath, fileNameFromPath } from "../lib/fileSearch";

/**
 * 描述项目全文搜索侧栏组件的输入属性。
 */
export interface ProjectTextSearchSidebarProps {
  cwd?: string;
  error?: ApplicationError;
  isSearching: boolean;
  query: string;
  result?: ProjectTextSearchResult;
  onChangeQuery(query: string): void;
  onClear(): void;
  onOpenMatch(path: string, lineNumber: number): void;
}

/**
 * 渲染类似 VSCode 的项目全文搜索侧栏。
 */
export function ProjectTextSearchSidebar({
  cwd,
  error,
  isSearching,
  query,
  result,
  onChangeQuery,
  onClear,
  onOpenMatch,
}: ProjectTextSearchSidebarProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const firstMatch = result?.files[0]?.matches[0];
  const firstMatchPath = result?.files[0]?.path;

  /**
   * 搜索面板显示后自动聚焦输入框。
   */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * 支持回车打开第一个搜索命中，Esc 清空当前查询。
   */
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query.trim()) {
      event.preventDefault();
      onClear();
      return;
    }

    if (event.key !== "Enter" || !firstMatch || !firstMatchPath) {
      return;
    }

    event.preventDefault();
    onOpenMatch(firstMatchPath, firstMatch.lineNumber);
  };

  return (
    <aside className="project-text-search-sidebar" aria-label="全文搜索">
      <header className="git-sidebar-header">
        <div className="git-sidebar-title">
          <Search aria-hidden="true" size={14} strokeWidth={2} />
          <span>Search</span>
        </div>
      </header>
      <div className="project-text-search-form">
        <div className="project-text-search-input-shell">
          <input
            ref={inputRef}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="project-text-search-input"
            disabled={!cwd}
            placeholder="Search in files"
            spellCheck={false}
            type="text"
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {query ? (
            <button
              className="project-text-search-clear"
              type="button"
              title="清空搜索"
              onClick={onClear}
            >
              <X aria-hidden="true" size={13} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
      </div>
      <ProjectTextSearchBody
        error={error}
        isSearching={isSearching}
        query={query}
        result={result}
        onOpenMatch={onOpenMatch}
      />
    </aside>
  );
}

interface ProjectTextSearchBodyProps {
  error?: ApplicationError;
  isSearching: boolean;
  query: string;
  result?: ProjectTextSearchResult;
  onOpenMatch(path: string, lineNumber: number): void;
}

/**
 * 根据搜索状态渲染空态、错误态或分组结果列表。
 */
function ProjectTextSearchBody({
  error,
  isSearching,
  query,
  result,
  onOpenMatch,
}: ProjectTextSearchBodyProps): ReactElement {
  const hasQuery = Boolean(query.trim());
  const resultCountText = result
    ? `${result.matchCount} results in ${result.files.length} files`
    : undefined;

  if (error) {
    return <div className="project-text-search-empty">{error.message}</div>;
  }

  if (!hasQuery) {
    return <div className="project-text-search-empty">Type to search across files.</div>;
  }

  if (isSearching && !result) {
    return <div className="project-text-search-empty">Searching...</div>;
  }

  if (!isSearching && result && result.files.length === 0) {
    return <div className="project-text-search-empty">No results found.</div>;
  }

  return (
    <div className="project-text-search-body">
      {resultCountText ? (
        <div className="project-text-search-summary">
          {resultCountText}
          {result?.truncated ? " · limited" : ""}
          {isSearching ? " · searching" : ""}
        </div>
      ) : null}
      <div className="project-text-search-results">
        {result?.files.map((fileMatch) => (
          <div className="project-text-search-file" key={fileMatch.path}>
            <div className="project-text-search-file-header" title={fileMatch.path}>
              <span className="project-text-search-file-name">
                {fileNameFromPath(fileMatch.path)}
              </span>
              <span className="project-text-search-file-path">
                {fileDirectoryFromPath(fileMatch.path) ?? "."}
              </span>
            </div>
            {fileMatch.matches.map((lineMatch) => (
              <button
                className="project-text-search-line"
                key={`${fileMatch.path}:${lineMatch.lineNumber}:${lineMatch.startColumn}`}
                type="button"
                title={`${fileMatch.path}:${lineMatch.lineNumber}`}
                onClick={() => onOpenMatch(fileMatch.path, lineMatch.lineNumber)}
              >
                <span className="project-text-search-line-number">
                  {lineMatch.lineNumber}
                </span>
                <span className="project-text-search-line-text">
                  {renderHighlightedLine(lineMatch)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 按后端返回的一基列区间渲染单行命中的高亮片段。
 */
function renderHighlightedLine(match: ProjectTextSearchLineMatch): ReactNode {
  const chars = [...match.lineText];
  const startIndex = Math.max(0, match.startColumn - 1);
  const endIndex = Math.max(startIndex, match.endColumn - 1);
  const before = chars.slice(0, startIndex).join("");
  const highlighted = chars.slice(startIndex, endIndex).join("");
  const after = chars.slice(endIndex).join("");

  return (
    <>
      {before}
      <mark className="project-text-search-highlight">{highlighted}</mark>
      {after}
    </>
  );
}

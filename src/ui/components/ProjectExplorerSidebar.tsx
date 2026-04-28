import {
  ChevronRight,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useMemo, type CSSProperties, type ReactElement } from "react";
import type { ApplicationError } from "../../application/errors";
import type { ProjectDirectoryEntry } from "../../types/projectExplorer";
import { ProjectFileIcon } from "./ProjectFileIcon";

/**
 * 描述项目文件树面板组件的输入属性。
 */
export interface ProjectExplorerSidebarProps {
  activeFilePath?: string;
  cwd?: string;
  entriesByDirectory: Record<string, ProjectDirectoryEntry[]>;
  error?: ApplicationError;
  expandedDirectories: string[];
  isLoadingRoot: boolean;
  loadingDirectories: string[];
  openingFilePath?: string;
  onOpenFile(path: string): void;
  onRefresh(): void;
  onToggleDirectory(path: string): void;
}

/**
 * 渲染项目文件树，并支持目录展开与文件打开。
 */
export function ProjectExplorerSidebar({
  activeFilePath,
  cwd,
  entriesByDirectory,
  error,
  expandedDirectories,
  isLoadingRoot,
  loadingDirectories,
  openingFilePath,
  onOpenFile,
  onRefresh,
  onToggleDirectory,
}: ProjectExplorerSidebarProps): ReactElement {
  const rootEntries = entriesByDirectory[""] ?? [];
  const title = useMemo(() => projectTitleFromCwd(cwd), [cwd]);

  return (
    <aside className="project-explorer-sidebar" aria-label="文件树">
      <header className="git-sidebar-header">
        <div className="git-sidebar-title">
          <FolderOpen aria-hidden="true" size={14} strokeWidth={2} />
          <span>{title}</span>
        </div>
        <button
          className="git-sidebar-icon-button"
          type="button"
          title="刷新文件树"
          onClick={onRefresh}
        >
          <RefreshCw aria-hidden="true" size={14} strokeWidth={2} />
        </button>
      </header>

      {error ? <div className="git-sidebar-message">{error.message}</div> : null}
      {isLoadingRoot && rootEntries.length === 0 ? (
        <div className="git-sidebar-message">Loading...</div>
      ) : null}
      {!isLoadingRoot && rootEntries.length === 0 && !error ? (
        <div className="git-sidebar-empty">No files</div>
      ) : null}
      {rootEntries.length > 0 ? (
        <div className="project-explorer-tree">
          {rootEntries.map((entry) => (
            <ProjectExplorerNode
              key={entry.path}
              activeFilePath={activeFilePath}
              depth={0}
              entriesByDirectory={entriesByDirectory}
              entry={entry}
              expandedDirectories={expandedDirectories}
              loadingDirectories={loadingDirectories}
              openingFilePath={openingFilePath}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

interface ProjectExplorerNodeProps {
  activeFilePath?: string;
  depth: number;
  entriesByDirectory: Record<string, ProjectDirectoryEntry[]>;
  entry: ProjectDirectoryEntry;
  expandedDirectories: string[];
  loadingDirectories: string[];
  openingFilePath?: string;
  onOpenFile(path: string): void;
  onToggleDirectory(path: string): void;
}

/**
 * 渲染文件树中的单个节点及其已展开的子树。
 */
function ProjectExplorerNode({
  activeFilePath,
  depth,
  entriesByDirectory,
  entry,
  expandedDirectories,
  loadingDirectories,
  openingFilePath,
  onOpenFile,
  onToggleDirectory,
}: ProjectExplorerNodeProps): ReactElement {
  const isDirectory = entry.kind === "directory";
  const isExpanded = expandedDirectories.includes(entry.path);
  const isLoadingDirectory = loadingDirectories.includes(entry.path);
  const isOpeningFile = openingFilePath === entry.path;
  const childEntries = entriesByDirectory[entry.path] ?? [];
  const indentationStyle = {
    paddingLeft: `${10 + depth * 14}px`,
  } as CSSProperties;

  return (
    <>
      <button
        className={`project-explorer-row${
          entry.path === activeFilePath ? " is-active" : ""
        }`}
        type="button"
        style={indentationStyle}
        title={entry.path}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(entry.path);
            return;
          }

          onOpenFile(entry.path);
        }}
      >
        {isDirectory ? (
          <ChevronRight
            aria-hidden="true"
            size={13}
            strokeWidth={2.2}
            className={`project-explorer-chevron${isExpanded ? " is-open" : ""}`}
          />
        ) : (
          <span className="project-explorer-chevron is-placeholder" />
        )}
        <ProjectFileIcon entry={entry} isExpanded={isExpanded} />
        <span className="project-explorer-name">
          {isDirectory && isLoadingDirectory ? `${entry.name}...` : entry.name}
          {!isDirectory && isOpeningFile ? "..." : ""}
        </span>
      </button>
      {isDirectory && isExpanded
        ? childEntries.map((childEntry) => (
            <ProjectExplorerNode
              key={childEntry.path}
              activeFilePath={activeFilePath}
              depth={depth + 1}
              entriesByDirectory={entriesByDirectory}
              entry={childEntry}
              expandedDirectories={expandedDirectories}
              loadingDirectories={loadingDirectories}
              openingFilePath={openingFilePath}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
            />
          ))
        : null}
    </>
  );
}

/**
 * 从项目工作目录中提取适合展示的标题文本。
 */
function projectTitleFromCwd(cwd?: string): string {
  if (!cwd) {
    return "Files";
  }

  const normalizedPath = cwd.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/).filter(Boolean);

  return parts.at(-1) ?? cwd;
}

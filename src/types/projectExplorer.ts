/**
 * 描述前端加载项目目录内容所需的参数。
 */
export interface ProjectDirectoryRequest {
  cwd: string;
  path?: string;
}

/**
 * 描述前端读取单个项目文件内容所需的参数。
 */
export interface ProjectFileRequest {
  cwd: string;
  path: string;
}

/**
 * 描述前端加载项目全部文件路径所需的参数。
 */
export interface ProjectFileListRequest {
  cwd: string;
}

/**
 * 描述前端在项目内执行全文搜索所需的参数。
 */
export interface ProjectTextSearchRequest {
  cwd: string;
  query: string;
  maxResults?: number;
}

/**
 * 描述项目目录中的一条文件或目录记录。
 */
export interface ProjectDirectoryEntry {
  path: string;
  name: string;
  kind: "directory" | "file";
}

/**
 * 描述一次目录读取的返回结果。
 */
export interface ProjectDirectoryResult {
  path: string;
  entries: ProjectDirectoryEntry[];
}

/**
 * 描述单个项目文件内容的返回结果。
 */
export interface ProjectFileResult {
  path: string;
  content: string;
  isBinary: boolean;
}

/**
 * 描述一次项目全量文件路径读取的返回结果。
 */
export interface ProjectFileListResult {
  paths: string[];
}

/**
 * 描述全文搜索命中的单行位置和预览内容。
 */
export interface ProjectTextSearchLineMatch {
  lineNumber: number;
  lineText: string;
  startColumn: number;
  endColumn: number;
}

/**
 * 描述全文搜索中单个文件的命中集合。
 */
export interface ProjectTextSearchFileMatch {
  path: string;
  matches: ProjectTextSearchLineMatch[];
}

/**
 * 描述一次项目全文搜索的返回结果。
 */
export interface ProjectTextSearchResult {
  query: string;
  files: ProjectTextSearchFileMatch[];
  matchCount: number;
  truncated: boolean;
}

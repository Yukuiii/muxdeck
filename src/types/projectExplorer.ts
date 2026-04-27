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

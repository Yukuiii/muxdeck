import type {
  ProjectDirectoryRequest,
  ProjectDirectoryResult,
  ProjectFileListRequest,
  ProjectFileListResult,
  ProjectFileRequest,
  ProjectFileResult,
  ProjectTextSearchRequest,
  ProjectTextSearchResult,
} from "../../types/projectExplorer";

/**
 * 定义前端应用层访问项目文件树与文件内容的端口。
 */
export interface ProjectExplorerGateway {
  loadDirectory(request: ProjectDirectoryRequest): Promise<ProjectDirectoryResult>;
  listFiles(request: ProjectFileListRequest): Promise<ProjectFileListResult>;
  readFile(request: ProjectFileRequest): Promise<ProjectFileResult>;
  searchText(request: ProjectTextSearchRequest): Promise<ProjectTextSearchResult>;
}

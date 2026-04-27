import type {
  ProjectDirectoryRequest,
  ProjectDirectoryResult,
  ProjectFileRequest,
  ProjectFileResult,
} from "../../types/projectExplorer";

/**
 * 定义前端应用层访问项目文件树与文件内容的端口。
 */
export interface ProjectExplorerGateway {
  loadDirectory(request: ProjectDirectoryRequest): Promise<ProjectDirectoryResult>;
  readFile(request: ProjectFileRequest): Promise<ProjectFileResult>;
}

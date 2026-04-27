import { invoke } from "@tauri-apps/api/core";
import type { ProjectExplorerGateway } from "../../application/explorer/ProjectExplorerGateway";
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
 * 使用 Tauri command 实现项目文件树和文件内容访问端口。
 */
export class TauriProjectExplorerGateway implements ProjectExplorerGateway {
  /**
   * 加载指定目录下的直接子项列表。
   */
  loadDirectory(request: ProjectDirectoryRequest): Promise<ProjectDirectoryResult> {
    return invoke<ProjectDirectoryResult>("load_project_directory", { request });
  }

  /**
   * 加载当前项目中的全部文件路径。
   */
  listFiles(request: ProjectFileListRequest): Promise<ProjectFileListResult> {
    return invoke<ProjectFileListResult>("list_project_files", { request });
  }

  /**
   * 读取指定项目文件的内容。
   */
  readFile(request: ProjectFileRequest): Promise<ProjectFileResult> {
    return invoke<ProjectFileResult>("read_project_file", { request });
  }

  /**
   * 在当前项目中执行全文搜索。
   */
  searchText(request: ProjectTextSearchRequest): Promise<ProjectTextSearchResult> {
    return invoke<ProjectTextSearchResult>("search_project_text", { request });
  }
}

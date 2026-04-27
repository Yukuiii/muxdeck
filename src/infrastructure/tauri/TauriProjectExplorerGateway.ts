import { invoke } from "@tauri-apps/api/core";
import type { ProjectExplorerGateway } from "../../application/explorer/ProjectExplorerGateway";
import type {
  ProjectDirectoryRequest,
  ProjectDirectoryResult,
  ProjectFileRequest,
  ProjectFileResult,
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
   * 读取指定项目文件的内容。
   */
  readFile(request: ProjectFileRequest): Promise<ProjectFileResult> {
    return invoke<ProjectFileResult>("read_project_file", { request });
  }
}

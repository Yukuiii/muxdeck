import type { GitPanelGateway } from "./git/GitPanelGateway";
import type { ConfirmationDialog } from "./system/ConfirmationDialog";
import type { ProjectDirectoryPicker } from "./system/ProjectDirectoryPicker";
import type { TerminalGateway } from "./terminal/TerminalGateway";
import { WorkspaceStore } from "./workspace/WorkspaceStore";
import { TauriConfirmationDialog } from "../infrastructure/tauri/TauriConfirmationDialog";
import { TauriGitPanelGateway } from "../infrastructure/tauri/TauriGitPanelGateway";
import { TauriProjectDirectoryPicker } from "../infrastructure/tauri/TauriProjectDirectoryPicker";
import { TauriTerminalGateway } from "../infrastructure/tauri/TauriTerminalGateway";
import { TauriWorkspaceRepository } from "../infrastructure/tauri/TauriWorkspaceRepository";

/**
 * 聚合前端应用运行所需的端口实现。
 */
export interface ApplicationServices {
  terminalGateway: TerminalGateway;
  gitPanelGateway: GitPanelGateway;
  projectDirectoryPicker: ProjectDirectoryPicker;
  confirmationDialog: ConfirmationDialog;
  createWorkspaceStore(): Promise<WorkspaceStore>;
}

/**
 * 创建生产环境使用的 Tauri 服务组合根。
 */
export function createApplicationServices(): ApplicationServices {
  return {
    terminalGateway: new TauriTerminalGateway(),
    gitPanelGateway: new TauriGitPanelGateway(),
    projectDirectoryPicker: new TauriProjectDirectoryPicker(),
    confirmationDialog: new TauriConfirmationDialog(),
    async createWorkspaceStore() {
      const repository = await TauriWorkspaceRepository.create();

      return WorkspaceStore.create(repository);
    },
  };
}

export const applicationServices = createApplicationServices();

import type {
  GitCommitRequest,
  GitCommitResult,
  GitPanelRequest,
  GitPanelState,
} from "../../types/gitPanel";

/**
 * 定义前端应用层访问后端 Git 面板能力的端口。
 */
export interface GitPanelGateway {
  loadPanel(request: GitPanelRequest): Promise<GitPanelState>;
  commitStagedChanges(request: GitCommitRequest): Promise<GitCommitResult>;
}

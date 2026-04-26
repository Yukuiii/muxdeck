import type {
  GitAllDiffRequest,
  GitCommitRequest,
  GitCommitResult,
  GitDiffRequest,
  GitDiffResult,
  GitPanelRequest,
  GitPanelState,
  GitStageFileRequest,
  GitStageRequest,
  GitStageResult,
  GitUnstageFileRequest,
  GitUnstageRequest,
  GitUnstageResult,
} from "../../types/gitPanel";

/**
 * 定义前端应用层访问后端 Git 面板能力的端口。
 */
export interface GitPanelGateway {
  loadPanel(request: GitPanelRequest): Promise<GitPanelState>;
  commitStagedChanges(request: GitCommitRequest): Promise<GitCommitResult>;
  stageUnstagedChanges(request: GitStageRequest): Promise<GitStageResult>;
  stageFile(request: GitStageFileRequest): Promise<GitStageResult>;
  unstageAll(request: GitUnstageRequest): Promise<GitUnstageResult>;
  unstageFile(request: GitUnstageFileRequest): Promise<GitUnstageResult>;
  loadFileDiff(request: GitDiffRequest): Promise<GitDiffResult>;
  loadAllDiffs(request: GitAllDiffRequest): Promise<GitDiffResult>;
}

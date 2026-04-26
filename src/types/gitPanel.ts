export interface GitPanelRequest {
  cwd: string;
}

export interface GitCommitRequest {
  cwd: string;
  message: string;
}

export interface GitStageRequest {
  cwd: string;
}

/**
 * 描述前端暂存单个文件变更所需的参数。
 */
export interface GitStageFileRequest {
  cwd: string;
  path: string;
}

/**
 * 描述前端取消暂存所有文件所需的参数。
 */
export interface GitUnstageRequest {
  cwd: string;
}

/**
 * 描述前端取消暂存单个文件所需的参数。
 */
export interface GitUnstageFileRequest {
  cwd: string;
  path: string;
}

export interface GitCommitResult {
  hash: string;
}

export interface GitStageResult {
  staged: boolean;
}

export interface GitUnstageResult {
  unstaged: boolean;
}

export interface GitPanelState {
  isRepository: boolean;
  branch?: string;
  unstagedChanges: GitChange[];
  stagedChanges: GitChange[];
  history: GitCommit[];
}

export interface GitChange {
  status: string;
  path: string;
  additions: number;
  deletions: number;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  relativeTime: string;
  refs: string;
}

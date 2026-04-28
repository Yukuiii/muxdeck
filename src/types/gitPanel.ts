export interface GitPanelRequest {
  cwd: string;
}

export interface GitCommitRequest {
  cwd: string;
  message: string;
}

/**
 * 描述前端推送当前分支所需的参数。
 */
export interface GitPushRequest {
  cwd: string;
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

/**
 * 描述前端加载单文件 diff 所需的参数。
 */
export interface GitDiffRequest {
  cwd: string;
  path: string;
  staged: boolean;
}

/**
 * 描述前端加载全部文件 diff 所需的参数。
 */
export interface GitAllDiffRequest {
  cwd: string;
  staged: boolean;
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

/**
 * 描述 diff 中单个文件的旧版与新版快照。
 */
export interface GitDiffFileSnapshot {
  path: string;
  oldContent?: string;
  newContent?: string;
  oldBinary: boolean;
  newBinary: boolean;
}

/**
 * 描述单文件 diff 的返回内容。
 */
export interface GitDiffResult {
  path: string;
  staged: boolean;
  content: string;
  files: GitDiffFileSnapshot[];
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

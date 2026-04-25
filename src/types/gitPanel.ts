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

export interface GitCommitResult {
  hash: string;
}

export interface GitStageResult {
  staged: boolean;
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

export interface CreateTerminalRequest {
  sessionId: string;
  cwd?: string;
  rows: number;
  cols: number;
}

export interface TerminalSession {
  sessionId: string;
  cwd: string;
  shell: string;
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: number[];
}

export interface TerminalExitPayload {
  sessionId: string;
  reason: string;
}

export interface TerminalInputRequest {
  sessionId: string;
  data: string;
}

export interface ResizeTerminalRequest {
  sessionId: string;
  rows: number;
  cols: number;
}

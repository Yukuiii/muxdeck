import type {
  CreateTerminalRequest,
  ResizeTerminalRequest,
  TerminalExitPayload,
  TerminalInputRequest,
  TerminalOutputPayload,
  TerminalSession,
} from "../../types/terminal";

export type TerminalOutputHandler = (payload: TerminalOutputPayload) => void;
export type TerminalExitHandler = (payload: TerminalExitPayload) => void;

/**
 * 定义前端应用层访问后端 PTY 能力的端口。
 */
export interface TerminalGateway {
  start(
    onOutput: TerminalOutputHandler,
    onExit: TerminalExitHandler,
  ): Promise<void>;
  createSession(request: CreateTerminalRequest): Promise<TerminalSession>;
  writeInput(request: TerminalInputRequest): Promise<void>;
  resize(request: ResizeTerminalRequest): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  stop(): void;
}

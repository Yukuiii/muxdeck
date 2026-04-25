import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CreateTerminalRequest,
  ResizeTerminalRequest,
  TerminalExitPayload,
  TerminalInputRequest,
  TerminalOutputPayload,
  TerminalSession,
} from "../types/terminal";

export type TerminalOutputHandler = (payload: TerminalOutputPayload) => void;
export type TerminalExitHandler = (payload: TerminalExitPayload) => void;

export class TerminalBridge {
  private outputUnlisten?: UnlistenFn;
  private exitUnlisten?: UnlistenFn;

  /**
   * 监听 Rust 后端发出的终端输出和退出事件。
   */
  async start(
    onOutput: TerminalOutputHandler,
    onExit: TerminalExitHandler,
  ): Promise<void> {
    this.outputUnlisten = await listen<TerminalOutputPayload>(
      "terminal-output",
      (event) => onOutput(event.payload),
    );
    this.exitUnlisten = await listen<TerminalExitPayload>(
      "terminal-exit",
      (event) => onExit(event.payload),
    );
  }

  /**
   * 创建一个新的后端 PTY 会话。
   */
  createSession(request: CreateTerminalRequest): Promise<TerminalSession> {
    return invoke<TerminalSession>("create_terminal_session", { request });
  }

  /**
   * 将用户输入写入指定 PTY 会话。
   */
  writeInput(request: TerminalInputRequest): Promise<void> {
    return invoke<void>("write_terminal_input", { request });
  }

  /**
   * 同步前端终端尺寸到后端 PTY。
   */
  resize(request: ResizeTerminalRequest): Promise<void> {
    return invoke<void>("resize_terminal_session", { request });
  }

  /**
   * 关闭指定后端 PTY 会话。
   */
  closeSession(sessionId: string): Promise<void> {
    return invoke<void>("close_terminal_session", { sessionId });
  }

  /**
   * 释放所有前端事件监听器。
   */
  stop(): void {
    this.outputUnlisten?.();
    this.exitUnlisten?.();
    this.outputUnlisten = undefined;
    this.exitUnlisten = undefined;
  }
}

import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

export interface TerminalSize {
  rows: number;
  cols: number;
}

export type TerminalInputHandler = (data: string) => void;
export type TerminalResizeHandler = (size: TerminalSize) => void;

export class XtermRenderer {
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly resizeObserver: ResizeObserver;
  private lastSize: TerminalSize = { rows: 24, cols: 80 };

  /**
   * 初始化 xterm.js 渲染器并绑定输入、尺寸事件。
   */
  constructor(
    private readonly container: HTMLElement,
    onInput: TerminalInputHandler,
    private readonly onResize: TerminalResizeHandler,
  ) {
    this.terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      fontFamily:
        "JetBrains Mono, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.1,
      scrollback: 5000,
      theme: {
        background: "#0b0d10",
        foreground: "#d6dde7",
        cursor: "#8bd3ff",
        selectionBackground: "#31445d",
        black: "#111827",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#f59e0b",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e5e7eb",
        brightBlack: "#4b5563",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#fbbf24",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#f9fafb",
      },
    });
    this.fitAddon = new FitAddon();
    this.resizeObserver = new ResizeObserver(() => this.fit());

    this.terminal.loadAddon(this.fitAddon);
    this.loadFastRenderer();
    this.terminal.onData(onInput);
  }

  /**
   * 挂载终端到容器并完成首次尺寸同步。
   */
  mount(): TerminalSize {
    this.terminal.open(this.container);
    this.resizeObserver.observe(this.container);
    return this.fit();
  }

  /**
   * 将后端 PTY 输出写入终端缓冲区。
   */
  write(data: Uint8Array): void {
    this.terminal.write(data);
  }

  /**
   * 聚焦终端输入区域。
   */
  focus(): void {
    this.terminal.focus();
  }

  /**
   * 清理 xterm.js 实例和相关浏览器资源。
   */
  dispose(): void {
    this.resizeObserver.disconnect();
    this.terminal.dispose();
  }

  /**
   * 根据容器尺寸重新计算终端行列数。
   */
  fit(): TerminalSize {
    this.fitAddon.fit();
    const size = {
      rows: this.terminal.rows,
      cols: this.terminal.cols,
    };

    if (size.rows !== this.lastSize.rows || size.cols !== this.lastSize.cols) {
      this.lastSize = size;
      this.onResize(size);
    }

    return size;
  }

  /**
   * 优先启用 WebGL 渲染，失败时退回 Canvas 渲染。
   */
  private loadFastRenderer(): void {
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      this.terminal.loadAddon(webglAddon);
      return;
    } catch {
      this.terminal.loadAddon(new CanvasAddon());
    }
  }
}

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

/**
 * 封装 xterm.js 渲染实例和终端输入兼容逻辑。
 */
export class XtermRenderer {
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly terminalDisposables: Array<{ dispose(): void }> = [];
  private readonly resizeObserver: ResizeObserver;
  private lastSize: TerminalSize = { rows: 24, cols: 80 };
  private lastTerminalData?: { data: string; at: number };
  private textareaInputHandler?: (event: Event) => void;

  /**
   * 初始化 xterm.js 渲染器并绑定输入、尺寸事件。
   */
  constructor(
    private readonly container: HTMLElement,
    private readonly onInput: TerminalInputHandler,
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
        background: "#24273a",
        foreground: "#cad3f5",
        cursor: "#f4dbd6",
        selectionBackground: "#5b6078",
        black: "#494d64",
        red: "#ed8796",
        green: "#a6da95",
        yellow: "#eed49f",
        blue: "#8aadf4",
        magenta: "#f5bde6",
        cyan: "#8bd5ca",
        white: "#b8c0e0",
        brightBlack: "#5b6078",
        brightRed: "#ed8796",
        brightGreen: "#a6da95",
        brightYellow: "#eed49f",
        brightBlue: "#8aadf4",
        brightMagenta: "#f5bde6",
        brightCyan: "#8bd5ca",
        brightWhite: "#cad3f5",
      },
    });
    this.fitAddon = new FitAddon();
    this.resizeObserver = new ResizeObserver(() => this.fit());

    this.terminal.loadAddon(this.fitAddon);
    this.loadFastRenderer();
    this.terminalDisposables.push(
      this.terminal.onData((data) => {
        this.lastTerminalData = { data, at: performance.now() };
        this.onInput(data);
      }),
    );
  }

  /**
   * 挂载终端到容器并完成首次尺寸同步。
   */
  mount(): TerminalSize {
    this.terminal.open(this.container);
    this.attachImeInputFallback();
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
    this.detachImeInputFallback();
    for (const disposable of this.terminalDisposables) {
      disposable.dispose();
    }
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

  /**
   * 补偿中文输入法下部分标点 input 事件未被 xterm 转成 onData 的情况。
   */
  private attachImeInputFallback(): void {
    const textarea = this.terminal.textarea;

    if (!textarea) {
      return;
    }

    this.textareaInputHandler = (event) => {
      const inputEvent = event as InputEvent;
      const data = inputEvent.data;

      if (
        !data ||
        inputEvent.isComposing ||
        inputEvent.inputType !== "insertText"
      ) {
        return;
      }

      const eventAt = performance.now();

      window.setTimeout(() => {
        if (this.didXtermHandleInput(data, eventAt)) {
          return;
        }

        this.onInput(data);
        textarea.value = "";
      }, 8);
    };

    textarea.addEventListener("input", this.textareaInputHandler);
  }

  /**
   * 移除 IME input fallback 监听器。
   */
  private detachImeInputFallback(): void {
    const textarea = this.terminal.textarea;

    if (!textarea || !this.textareaInputHandler) {
      return;
    }

    textarea.removeEventListener("input", this.textareaInputHandler);
    this.textareaInputHandler = undefined;
  }

  /**
   * 判断 xterm 是否已在同一输入事件之后发出了对应数据。
   */
  private didXtermHandleInput(data: string, eventAt: number): boolean {
    return Boolean(
      this.lastTerminalData &&
        this.lastTerminalData.at >= eventAt &&
        this.lastTerminalData.data === data,
    );
  }
}

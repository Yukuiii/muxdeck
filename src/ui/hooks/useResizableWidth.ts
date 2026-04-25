import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type ResizeEdge = "left" | "right";

/**
 * 描述可拖拽宽度的配置项。
 */
export interface ResizableWidthOptions {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  edge: ResizeEdge;
}

/**
 * 描述可拖拽宽度 hook 返回的状态和事件入口。
 */
export interface ResizableWidthState {
  width: number;
  startResize(event: ReactPointerEvent<HTMLElement>): void;
}

/**
 * 管理水平拖拽调整面板宽度的交互状态。
 */
export function useResizableWidth({
  defaultWidth,
  minWidth,
  maxWidth,
  edge,
}: ResizableWidthOptions): ResizableWidthState {
  const [width, setWidth] = useState(defaultWidth);

  /**
   * 开始监听全局 pointermove 并按拖拽边计算新宽度。
   */
  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = width;

      document.body.classList.add("is-resizing-panel");

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const offset =
          edge === "left" ? startX - moveEvent.clientX : moveEvent.clientX - startX;
        setWidth(clampWidth(startWidth + offset, minWidth, maxWidth));
      };

      const stopResize = () => {
        document.body.classList.remove("is-resizing-panel");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [edge, maxWidth, minWidth, width],
  );

  return {
    width,
    startResize,
  };
}

/**
 * 将拖拽后的宽度限制在允许范围内。
 */
function clampWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(Math.max(width, minWidth), maxWidth);
}

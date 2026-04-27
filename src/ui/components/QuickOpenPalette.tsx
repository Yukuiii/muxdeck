import { Search } from "lucide-react";
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import type { ApplicationError } from "../../application/errors";
import {
  fileDirectoryFromPath,
  fileNameFromPath,
  type FileSearchMatch,
} from "../lib/fileSearch";

/**
 * 描述快速打开浮层组件的输入属性。
 */
export interface QuickOpenPaletteProps {
  error?: ApplicationError;
  isLoading: boolean;
  isOpen: boolean;
  matches: FileSearchMatch[];
  query: string;
  selectedIndex: number;
  onChangeQuery(query: string): void;
  onClose(): void;
  onOpenMatch(path: string): void;
  onSelectIndex(index: number): void;
}

/**
 * 渲染类似编辑器的全局文件快速打开浮层。
 */
export function QuickOpenPalette({
  error,
  isLoading,
  isOpen,
  matches,
  query,
  selectedIndex,
  onChangeQuery,
  onClose,
  onOpenMatch,
  onSelectIndex,
}: QuickOpenPaletteProps): ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 浮层打开后自动聚焦输入框，减少额外交互步骤。
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  /**
   * 处理结果列表内的键盘导航与打开行为。
   */
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onSelectIndex(matches.length === 0 ? 0 : (selectedIndex + 1) % matches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      onSelectIndex(
        matches.length === 0 ? 0 : (selectedIndex - 1 + matches.length) % matches.length,
      );
      return;
    }

    if (event.key === "Enter") {
      const selectedMatch = matches[selectedIndex];

      if (!selectedMatch) {
        return;
      }

      event.preventDefault();
      onOpenMatch(selectedMatch.path);
    }
  };

  return (
    <div className="quick-open-backdrop" onClick={onClose}>
      <section
        aria-label="快速打开文件"
        className="quick-open-palette"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="quick-open-input-shell">
          <Search aria-hidden="true" size={15} strokeWidth={2.1} />
          <input
            ref={inputRef}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="quick-open-input"
            placeholder="搜索文件"
            spellCheck={false}
            type="text"
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>
        {error ? <div className="quick-open-empty">{error.message}</div> : null}
        {!error && isLoading ? <div className="quick-open-empty">Loading files...</div> : null}
        {!error && !isLoading && matches.length === 0 ? (
          <div className="quick-open-empty">
            {query.trim() ? "No matching files" : "No files"}
          </div>
        ) : null}
        {!error && !isLoading && matches.length > 0 ? (
          <div className="quick-open-results" role="listbox">
            {matches.map((match, index) => {
              const fileName = fileNameFromPath(match.path);
              const directory = fileDirectoryFromPath(match.path);

              return (
                <button
                  className={`quick-open-result${
                    index === selectedIndex ? " is-active" : ""
                  }`}
                  key={match.path}
                  type="button"
                  onClick={() => onOpenMatch(match.path)}
                  onMouseEnter={() => onSelectIndex(index)}
                >
                  <span className="quick-open-result-name">{fileName}</span>
                  <span className="quick-open-result-path">{directory ?? "."}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

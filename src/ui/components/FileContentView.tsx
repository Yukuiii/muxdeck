import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  highlightCodeAsHtml,
  resolveHighlightLanguage,
} from "../lib/codeHighlight";

/**
 * 描述文件内容视图组件的输入属性。
 */
export interface FileContentViewProps {
  content: string;
  isBinary: boolean;
  path: string;
  targetLineNumber?: number;
}

/**
 * 渲染类似编辑器的文本文件内容视图。
 */
export function FileContentView({
  content,
  isBinary,
  path,
  targetLineNumber,
}: FileContentViewProps): ReactElement {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");
  const isEmpty = !isBinary && normalizedContent.length === 0;
  const [highlightedHtml, setHighlightedHtml] = useState<string>();
  const highlightedContentRef = useRef<HTMLDivElement | null>(null);
  const targetLineRef = useRef<HTMLSpanElement | null>(null);

  /**
   * 在文本文件内容变化时异步生成 VSCode 风格的语法高亮 HTML。
   */
  useEffect(() => {
    if (isBinary || isEmpty) {
      setHighlightedHtml(undefined);
      return;
    }

    const highlightLanguage = resolveHighlightLanguage(path);

    if (!highlightLanguage) {
      setHighlightedHtml(undefined);
      return;
    }

    let isCancelled = false;
    setHighlightedHtml(undefined);

    void highlightCodeAsHtml(normalizedContent, highlightLanguage).then((html) => {
      if (isCancelled) {
        return;
      }

      setHighlightedHtml(html);
    });

    return () => {
      isCancelled = true;
    };
  }, [isBinary, isEmpty, normalizedContent, path]);

  /**
   * 文件从全文搜索打开时滚动并高亮目标行。
   */
  useEffect(() => {
    if (!targetLineNumber || isBinary || isEmpty) {
      return;
    }

    const highlightedLine = highlightedContentRef.current?.querySelector(
      `.line:nth-child(${targetLineNumber})`,
    );
    const targetElement = targetLineRef.current ?? highlightedLine;

    if (!targetElement) {
      return;
    }

    highlightedLine?.classList.add("file-content-target-line");
    targetElement.scrollIntoView({ block: "center" });

    return () => {
      highlightedLine?.classList.remove("file-content-target-line");
    };
  }, [highlightedHtml, isBinary, isEmpty, path, targetLineNumber]);

  return (
    <section className="file-content-view" aria-label={`File ${path}`}>
      <header className="file-content-header">
        <span className="file-content-title">{path}</span>
        <span className={`file-content-kind-pill${isBinary ? " is-binary" : ""}`}>
          {isBinary ? "Binary" : "Text"}
        </span>
      </header>
      <div className="file-content-scroll">
        {isBinary ? (
          <div className="file-content-empty">{content}</div>
        ) : isEmpty ? (
          <div className="file-content-empty">Empty file.</div>
        ) : highlightedHtml ? (
          <div
            ref={highlightedContentRef}
            className="file-content-highlight"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="file-content-code">
            {lines.map((line, index) => (
              <span
                ref={targetLineNumber === index + 1 ? targetLineRef : undefined}
                className={`file-content-row${
                  targetLineNumber === index + 1 ? " file-content-target-line" : ""
                }`}
                key={`${path}:${index + 1}`}
              >
                <span className="file-content-gutter">{index + 1}</span>
                <span className="file-content-text">{line || " "}</span>
              </span>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}

import type { ReactElement } from "react";

/**
 * 描述文件内容视图组件的输入属性。
 */
export interface FileContentViewProps {
  content: string;
  isBinary: boolean;
  path: string;
}

/**
 * 渲染类似编辑器的文本文件内容视图。
 */
export function FileContentView({
  content,
  isBinary,
  path,
}: FileContentViewProps): ReactElement {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");
  const isEmpty = !isBinary && normalizedContent.length === 0;

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
        ) : (
          <pre className="file-content-code">
            {lines.map((line, index) => (
              <span className="file-content-row" key={`${path}:${index + 1}`}>
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

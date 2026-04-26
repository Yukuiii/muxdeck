import type { ReactElement } from "react";

interface ParsedDiffLine {
  left: string;
  right: string;
  text: string;
  type: "context" | "add" | "remove";
}

/**
 * 描述 Git diff 视图组件的输入属性。
 */
export interface GitDiffViewProps {
  content: string;
  path: string;
  staged: boolean;
}

/**
 * 渲染类似编辑器的统一 diff 视图。
 */
export function GitDiffView({ content, path, staged }: GitDiffViewProps): ReactElement {
  const lines = parseDiff(content);
  const stageLabel = staged ? "Staged" : "Changes";

  return (
    <section className="git-diff-view" aria-label={`Diff ${path}`}>
      <header className="git-diff-header">
        <div className="git-diff-title">{path}</div>
        <span className={`git-diff-stage-pill${staged ? " is-staged" : ""}`}>
          {stageLabel}
        </span>
      </header>
      <div className="git-diff-scroll">
        {lines.length === 0 ? (
          <div className="git-diff-empty">No diff output.</div>
        ) : (
          <pre className="git-diff-code">
            {lines.map((line, index) => (
              <DiffRow key={`${index}:${line.left}:${line.right}:${line.text}`} line={line} />
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}

interface DiffRowProps {
  line: ParsedDiffLine;
}

/**
 * 渲染单行 diff 内容和行号列。
 */
function DiffRow({ line }: DiffRowProps): ReactElement {
  return (
    <span className={`git-diff-row is-${line.type}`}>
      <span className="git-diff-gutter">{line.left}</span>
      <span className="git-diff-gutter">{line.right}</span>
      <span className="git-diff-text">{line.text}</span>
    </span>
  );
}

/**
 * 将 unified diff 文本解析为可渲染行。
 */
function parseDiff(content: string): ParsedDiffLine[] {
  if (!content.trim()) {
    return [];
  }

  const rawLines = content.replace(/\r\n/g, "\n").split("\n");
  const parsedLines: ParsedDiffLine[] = [];
  let leftLine = 0;
  let rightLine = 0;

  for (const rawLine of rawLines) {
    if (!rawLine) {
      parsedLines.push({
        left: "",
        right: "",
        text: "",
        type: "context",
      });
      continue;
    }

    if (rawLine.startsWith("@@")) {
      const hunkHeader = parseHunkHeader(rawLine);

      if (hunkHeader) {
        leftLine = hunkHeader.leftStart;
        rightLine = hunkHeader.rightStart;
      }

      continue;
    }

    if (
      rawLine.startsWith("diff --git") ||
      rawLine.startsWith("index ") ||
      rawLine.startsWith("--- ") ||
      rawLine.startsWith("+++ ")
    ) {
      continue;
    }

    if (rawLine.startsWith("-")) {
      parsedLines.push({
        left: String(leftLine),
        right: "",
        text: rawLine,
        type: "remove",
      });
      leftLine += 1;
      continue;
    }

    if (rawLine.startsWith("+")) {
      parsedLines.push({
        left: "",
        right: String(rightLine),
        text: rawLine,
        type: "add",
      });
      rightLine += 1;
      continue;
    }

    parsedLines.push({
      left: leftLine > 0 ? String(leftLine) : "",
      right: rightLine > 0 ? String(rightLine) : "",
      text: rawLine,
      type: "context",
    });
    leftLine += 1;
    rightLine += 1;
  }

  return parsedLines;
}

/**
 * 解析 hunk header 中的起始行号。
 */
function parseHunkHeader(rawLine: string): { leftStart: number; rightStart: number } | null {
  const match = rawLine.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);

  if (!match) {
    return null;
  }

  const leftStart = Number.parseInt(match[1], 10);
  const rightStart = Number.parseInt(match[2], 10);

  if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) {
    return null;
  }

  return {
    leftStart,
    rightStart,
  };
}

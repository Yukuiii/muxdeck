import type { ReactElement } from "react";

interface ParsedDiffLine {
  left: string;
  right: string;
  text: string;
  type: "context" | "add" | "remove";
}

interface FileDiffSection {
  path: string;
  lines: ParsedDiffLine[];
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
 * 渲染类似编辑器的 diff 视图，多文件时按文件分组展示卡片。
 */
export function GitDiffView({ content, path, staged }: GitDiffViewProps): ReactElement {
  const fileSections = splitDiffByFile(content);
  const stageLabel = staged ? "Staged" : "Changes";
  const isEmpty = fileSections.every((section) => section.lines.length === 0);
  const isMultiFile = fileSections.length > 1;

  return (
    <section className="git-diff-view" aria-label={`Diff ${path}`}>
      {isMultiFile ? (
        <header className="git-diff-header">
          <div className="git-diff-title">{path}</div>
          <span className={`git-diff-stage-pill${staged ? " is-staged" : ""}`}>
            {stageLabel}
          </span>
        </header>
      ) : null}
      <div className="git-diff-scroll">
        {isEmpty ? (
          <div className="git-diff-empty">No diff output.</div>
        ) : (
          fileSections.map((section) => (
            <div className="git-diff-file-group" key={section.path}>
              <div className="git-diff-file-header">
                {isMultiFile ? (
                  section.path
                ) : (
                  <>
                    <span className="git-diff-file-header-path">{section.path}</span>
                    <span className={`git-diff-stage-pill${staged ? " is-staged" : ""}`}>
                      {stageLabel}
                    </span>
                  </>
                )}
              </div>
              {section.lines.length > 0 ? (
                <pre className="git-diff-code">
                  {section.lines.map((line, index) => (
                    <DiffRow
                      key={`${section.path}:${index}:${line.left}:${line.right}`}
                      line={line}
                    />
                  ))}
                </pre>
              ) : (
                <div className="git-diff-empty">No changes</div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

interface DiffRowProps {
  line: ParsedDiffLine;
}

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
 * 将多文件 unified diff 按 diff --git 标记拆分为文件级分段。
 */
function splitDiffByFile(content: string): FileDiffSection[] {
  if (!content.trim()) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const sections: FileDiffSection[] = [];
  const parts = normalized.split(/(?=^diff --git )/m);

  for (const part of parts) {
    const path = extractDiffFilePath(part);
    const lines = parseDiffSection(part);

    if (path) {
      sections.push({ path, lines });
    }
  }

  return sections;
}

/**
 * 从文件路径中提取仅文件名部分。
 */
function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);

  return parts.at(-1) ?? normalized;
}

/**
 * 从 diff --git a/path b/path 行中提取文件路径。
 */
function extractDiffFilePath(chunk: string): string | null {
  const match = chunk.match(/^diff --git a\/(.+) b\/(.+)/m);

  if (!match) {
    return null;
  }

  return match[2] ?? match[1] ?? null;
}

/**
 * 解析单个文件的 diff 片段为可渲染行。
 */
function parseDiffSection(chunk: string): ParsedDiffLine[] {
  const rawLines = chunk.split("\n");
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

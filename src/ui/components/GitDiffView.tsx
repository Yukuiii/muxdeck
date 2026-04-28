import {
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import type { GitDiffFileSnapshot } from "../../types/gitPanel";
import {
  highlightCodeAsTokens,
  resolveHighlightLanguage,
  type HighlightedToken,
} from "../lib/codeHighlight";

interface ParsedDiffLine {
  left: string;
  right: string;
  text: string;
  type: "context" | "add" | "remove" | "meta" | "separator";
}

interface FileDiffSection {
  path: string;
  lines: ParsedDiffLine[];
}

interface FileHighlightState {
  oldLines?: HighlightedToken[][];
  newLines?: HighlightedToken[][];
}

interface DiffLinePresentation {
  content: string;
  marker: string;
  shouldHighlight: boolean;
}

/**
 * 描述 Git diff 视图组件的输入属性。
 */
export interface GitDiffViewProps {
  content: string;
  files: GitDiffFileSnapshot[];
  path: string;
  staged: boolean;
}

/**
 * 渲染类似编辑器的 diff 视图，多文件时按文件分组展示卡片。
 */
export function GitDiffView({
  content,
  files,
  path,
  staged,
}: GitDiffViewProps): ReactElement {
  const fileSections = useMemo(() => splitDiffByFile(content), [content]);
  const stageLabel = staged ? "Staged" : "Changes";
  const isEmpty = fileSections.every((section) => section.lines.length === 0);
  const isMultiFile = fileSections.length > 1;
  const singleFileHeaderPath = fileSections[0]?.path ?? path;
  const [highlightedFilesByPath, setHighlightedFilesByPath] = useState<
    Record<string, FileHighlightState>
  >({});

  /**
   * 为当前 diff 中每个文件的旧版与新版源码生成逐行语法高亮 token。
   */
  useEffect(() => {
    let isCancelled = false;
    setHighlightedFilesByPath({});

    void Promise.all(
      files.map(async (file) => {
        const highlightLanguage = resolveHighlightLanguage(file.path);

        if (!highlightLanguage) {
          return [file.path, undefined] as const;
        }

        let oldLines: HighlightedToken[][] | undefined;
        let newLines: HighlightedToken[][] | undefined;

        if (!file.oldBinary && file.oldContent !== undefined) {
          oldLines = await highlightCodeAsTokens(
            splitSourceTextIntoLines(file.oldContent),
            highlightLanguage,
          );
        }

        if (!file.newBinary && file.newContent !== undefined) {
          newLines =
            !file.oldBinary && file.oldContent === file.newContent
              ? oldLines
              : await highlightCodeAsTokens(
                  splitSourceTextIntoLines(file.newContent),
                  highlightLanguage,
                );
        }

        if (!oldLines && !newLines) {
          return [file.path, undefined] as const;
        }

        return [
          file.path,
          {
            oldLines,
            newLines,
          },
        ] as const;
      }),
    ).then((entries) => {
      if (isCancelled) {
        return;
      }

      const nextHighlights: Record<string, FileHighlightState> = {};

      for (const [filePath, highlightedFile] of entries) {
        if (highlightedFile) {
          nextHighlights[filePath] = highlightedFile;
        }
      }

      setHighlightedFilesByPath(nextHighlights);
    });

    return () => {
      isCancelled = true;
    };
  }, [files]);

  return (
    <section className="git-diff-view" aria-label={`Diff ${path}`}>
      {isMultiFile ? (
        <header className="git-diff-header">
          <div className="git-diff-title">{path}</div>
          <span className={`git-diff-stage-pill${staged ? " is-staged" : ""}`}>
            {stageLabel}
          </span>
        </header>
      ) : (
        <header className="git-diff-file-header">
          <span className="git-diff-file-header-path">{singleFileHeaderPath}</span>
          <span className={`git-diff-stage-pill${staged ? " is-staged" : ""}`}>
            {stageLabel}
          </span>
        </header>
      )}
      <div className="git-diff-scroll">
        {isEmpty ? (
          <div className="git-diff-empty">No diff output.</div>
        ) : (
          <div className="git-diff-content">
            {fileSections.map((section) => (
              <div className="git-diff-file-group" key={section.path}>
                {isMultiFile ? (
                  <div className="git-diff-file-header">{section.path}</div>
                ) : null}
                {section.lines.length > 0 ? (
                  <pre className="git-diff-code">
                    {section.lines.map((line, index) => (
                      <DiffRow
                        key={`${section.path}:${index}:${line.left}:${line.right}`}
                        highlightedTokens={resolveDiffLineTokens(
                          line,
                          highlightedFilesByPath[section.path],
                        )}
                        line={line}
                      />
                    ))}
                  </pre>
                ) : (
                  <div className="git-diff-empty">No changes</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface DiffRowProps {
  highlightedTokens?: HighlightedToken[];
  line: ParsedDiffLine;
}

/**
 * 渲染单行 diff 内容，并在可识别语言时套用源码 token 高亮。
 */
function DiffRow({ highlightedTokens, line }: DiffRowProps): ReactElement {
  if (line.type === "separator") {
    return (
      <span className="git-diff-row is-separator" aria-hidden="true">
        <span className="git-diff-separator-line" />
      </span>
    );
  }

  const presentation = getDiffLinePresentation(line);

  return (
    <span className={`git-diff-row is-${line.type}`}>
      <span className="git-diff-gutter">{line.left}</span>
      <span className="git-diff-gutter">{line.right}</span>
      <span className="git-diff-text">
        <span className="git-diff-text-mark" aria-hidden="true">
          {presentation.marker}
        </span>
        <span className="git-diff-text-code">
          {presentation.shouldHighlight && highlightedTokens ? (
            renderHighlightedTokens(highlightedTokens)
          ) : (
            <span className="git-diff-text-plain">{presentation.content || " "}</span>
          )}
        </span>
      </span>
    </span>
  );
}

/**
 * 解析 diff 行中的增删标记与真实源码内容。
 */
function getDiffLinePresentation(line: ParsedDiffLine): DiffLinePresentation {
  if (line.type === "meta" || line.type === "separator") {
    return {
      content: line.text,
      marker: "",
      shouldHighlight: false,
    };
  }

  if (line.type === "add" && line.text.startsWith("+")) {
    return {
      content: line.text.slice(1),
      marker: "+",
      shouldHighlight: true,
    };
  }

  if (line.type === "remove" && line.text.startsWith("-")) {
    return {
      content: line.text.slice(1),
      marker: "-",
      shouldHighlight: true,
    };
  }

  if (line.type === "context" && line.text.startsWith(" ")) {
    return {
      content: line.text.slice(1),
      marker: " ",
      shouldHighlight: true,
    };
  }

  return {
    content: line.text,
    marker: " ",
    shouldHighlight: false,
  };
}

/**
 * 根据 diff 行号从旧版或新版源码高亮结果中取回对应行的 token。
 */
function resolveDiffLineTokens(
  line: ParsedDiffLine,
  highlightedFile?: FileHighlightState,
): HighlightedToken[] | undefined {
  const leftLineNumber = parseDiffLineNumber(line.left);
  const rightLineNumber = parseDiffLineNumber(line.right);

  if (line.type === "remove" && leftLineNumber) {
    return highlightedFile?.oldLines?.[leftLineNumber - 1];
  }

  if (line.type === "add" && rightLineNumber) {
    return highlightedFile?.newLines?.[rightLineNumber - 1];
  }

  if (line.type === "context") {
    if (rightLineNumber) {
      return highlightedFile?.newLines?.[rightLineNumber - 1];
    }

    if (leftLineNumber) {
      return highlightedFile?.oldLines?.[leftLineNumber - 1];
    }
  }

  return undefined;
}

/**
 * 把 diff 行号字符串解析为可用于数组映射的数字。
 */
function parseDiffLineNumber(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

/**
 * 将逐个 token 的高亮结果映射为 React 行内节点。
 */
function renderHighlightedTokens(tokens: HighlightedToken[]): ReactElement[] {
  if (tokens.length === 0) {
    return [<span className="git-diff-text-plain" key="empty"> </span>];
  }

  return tokens.map((token, index) => (
    <span className="git-diff-token" key={`${index}:${token.content.length}`} style={token.style}>
      {token.content}
    </span>
  ));
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
  let isInHunk = false;

  for (const rawLine of rawLines) {
    if (!rawLine) {
      continue;
    }

    if (rawLine.startsWith("@@")) {
      if (isInHunk) {
        parsedLines.push({
          left: "",
          right: "",
          text: "",
          type: "separator",
        });
      }

      const hunkHeader = parseHunkHeader(rawLine);

      if (hunkHeader) {
        leftLine = hunkHeader.leftStart;
        rightLine = hunkHeader.rightStart;
      }

      isInHunk = true;
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

    if (!isInHunk || rawLine.startsWith("\\")) {
      parsedLines.push({
        left: "",
        right: "",
        text: rawLine,
        type: "meta",
      });
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

    if (!rawLine.startsWith(" ")) {
      parsedLines.push({
        left: "",
        right: "",
        text: rawLine,
        type: "meta",
      });
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

/**
 * 将源码文本拆为真实行数组，避免尾随换行生成额外伪行。
 */
function splitSourceTextIntoLines(content: string): string[] {
  const normalizedContent = content.replace(/\r\n/g, "\n");

  if (!normalizedContent) {
    return [];
  }

  const lines = normalizedContent.split("\n");

  if (normalizedContent.endsWith("\n")) {
    lines.pop();
  }

  return lines;
}

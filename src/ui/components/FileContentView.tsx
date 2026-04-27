import { bundledLanguages, codeToHtml } from "shiki";
import {
  useEffect,
  useState,
  type ReactElement,
} from "react";

const HIGHLIGHT_THEME = "dark-plus";

const FILE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cjs: "js",
  cs: "csharp",
  css: "css",
  cts: "ts",
  cxx: "cpp",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "html",
  html: "html",
  java: "java",
  js: "js",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  less: "less",
  md: "md",
  mdx: "mdx",
  mjs: "js",
  mts: "ts",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "svelte",
  toml: "toml",
  ts: "ts",
  tsx: "tsx",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const FILE_LANGUAGE_BY_NAME: Record<string, string> = {
  ".bash_profile": "bash",
  ".bashrc": "bash",
  ".env": "ini",
  ".gitignore": "gitignore",
  ".npmrc": "ini",
  ".profile": "bash",
  ".zshrc": "bash",
  "dockerfile": "dockerfile",
  "makefile": "makefile",
};

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
  const [highlightedHtml, setHighlightedHtml] = useState<string>();

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

    void highlightFileContent(normalizedContent, highlightLanguage).then((html) => {
      if (isCancelled) {
        return;
      }

      setHighlightedHtml(html);
    });

    return () => {
      isCancelled = true;
    };
  }, [isBinary, isEmpty, normalizedContent, path]);

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
            className="file-content-highlight"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
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

/**
 * 用 Shiki 生成包含 VSCode Dark+ 主题色的高亮 HTML。
 */
async function highlightFileContent(
  content: string,
  language: string,
): Promise<string | undefined> {
  try {
    return await codeToHtml(content, {
      lang: language,
      theme: HIGHLIGHT_THEME,
    });
  } catch {
    return undefined;
  }
}

/**
 * 根据文件名或扩展名推断可用于 Shiki 的语言标识。
 */
function resolveHighlightLanguage(path: string): string | undefined {
  const normalizedPath = path.trim().toLowerCase();
  const fileName = normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? normalizedPath;
  const extension = fileName.includes(".") ? fileName.split(".").at(-1) : undefined;
  const languageCandidate =
    FILE_LANGUAGE_BY_NAME[fileName] ??
    (extension ? FILE_LANGUAGE_BY_EXTENSION[extension] : undefined);

  if (!languageCandidate || !hasBundledLanguage(languageCandidate)) {
    return undefined;
  }

  return languageCandidate;
}

/**
 * 判断当前候选语言是否存在于 Shiki 自带语言集合中。
 */
function hasBundledLanguage(language: string): boolean {
  return Object.prototype.hasOwnProperty.call(bundledLanguages, language);
}

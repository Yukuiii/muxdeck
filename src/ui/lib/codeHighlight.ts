import type { CSSProperties } from "react";
import {
  bundledLanguages,
  codeToHtml,
  codeToTokens,
  type BundledLanguage,
  type ThemedToken,
} from "shiki";

const CODE_HIGHLIGHT_THEME = "dark-plus";

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
  dockerfile: "dockerfile",
  makefile: "makefile",
};

const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

/**
 * 描述单个高亮 token 的渲染数据。
 */
export interface HighlightedToken {
  content: string;
  style?: CSSProperties;
}

/**
 * 用 Shiki 生成包含 VSCode Dark+ 主题色的高亮 HTML。
 */
export async function highlightCodeAsHtml(
  content: string,
  language: BundledLanguage,
): Promise<string | undefined> {
  try {
    return await codeToHtml(content, {
      lang: language,
      theme: CODE_HIGHLIGHT_THEME,
    });
  } catch {
    return undefined;
  }
}

/**
 * 用 Shiki 将多行代码转换为逐行 token，供自定义布局视图渲染。
 */
export async function highlightCodeAsTokens(
  lines: string[],
  language: BundledLanguage,
): Promise<HighlightedToken[][] | undefined> {
  if (lines.length === 0) {
    return [];
  }

  try {
    const tokenResult = await codeToTokens(lines.join("\n"), {
      lang: language,
      theme: CODE_HIGHLIGHT_THEME,
    });

    return tokenResult.tokens.map((lineTokens) => lineTokens.map(mapThemedToken));
  } catch {
    return undefined;
  }
}

/**
 * 根据文件名或扩展名推断可用于 Shiki 的语言标识。
 */
export function resolveHighlightLanguage(path: string): BundledLanguage | undefined {
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
function hasBundledLanguage(language: string): language is BundledLanguage {
  return Object.prototype.hasOwnProperty.call(bundledLanguages, language);
}

/**
 * 将 Shiki token 转换为适合 React 行内渲染的样式对象。
 */
function mapThemedToken(token: ThemedToken): HighlightedToken {
  const style = buildTokenStyle(token);

  return {
    content: token.content,
    style: style ? style : undefined,
  };
}

/**
 * 将 Shiki token 样式信息归一化为 React 可消费的内联样式。
 */
function buildTokenStyle(token: ThemedToken): CSSProperties | undefined {
  if (token.htmlStyle) {
    return { ...token.htmlStyle };
  }

  const style: CSSProperties = {};

  if (token.color) {
    style.color = token.color;
  }

  if (token.bgColor) {
    style.backgroundColor = token.bgColor;
  }

  if (token.fontStyle && (token.fontStyle & FONT_STYLE_ITALIC) !== 0) {
    style.fontStyle = "italic";
  }

  if (token.fontStyle && (token.fontStyle & FONT_STYLE_BOLD) !== 0) {
    style.fontWeight = 700;
  }

  if (token.fontStyle && (token.fontStyle & FONT_STYLE_UNDERLINE) !== 0) {
    style.textDecoration = "underline";
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

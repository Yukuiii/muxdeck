import { generateManifest, type Manifest } from "material-icon-theme";
import type { ReactElement } from "react";
import type { ProjectDirectoryEntry } from "../../types/projectExplorer";

const materialIconManifest = generateManifest();

const materialIconUrls = import.meta.glob<string>(
  "/node_modules/material-icon-theme/icons/*.svg",
  {
    eager: true,
    exhaustive: true,
    import: "default",
    query: "?url",
  },
);

const fallbackExtensionIconNames: Record<string, string> = {
  bash: "console",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cs: "csharp",
  cts: "typescript",
  cxx: "cpp",
  fish: "console",
  h: "c",
  htm: "html",
  html: "html",
  js: "javascript",
  kt: "kotlin",
  mts: "typescript",
  php: "php",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  scss: "sass",
  sh: "console",
  ts: "typescript",
  vue: "vue",
  zsh: "console",
};

/**
 * 渲染与项目目录项匹配的 Material 文件图标。
 */
export function ProjectFileIcon({
  entry,
  isExpanded,
}: {
  entry: ProjectDirectoryEntry;
  isExpanded: boolean;
}): ReactElement {
  const iconUrl = resolveProjectEntryIconUrl(entry, isExpanded);

  return (
    <img
      alt=""
      aria-hidden="true"
      className="project-explorer-entry-icon"
      draggable={false}
      src={iconUrl}
    />
  );
}

/**
 * 根据目录项类型解析最终可渲染的图标地址。
 */
function resolveProjectEntryIconUrl(
  entry: ProjectDirectoryEntry,
  isExpanded: boolean,
): string {
  const iconName =
    entry.kind === "directory"
      ? resolveFolderIconName(entry.name, isExpanded)
      : resolveFileIconName(entry.name);

  return resolveIconUrl(iconName) ?? resolveFallbackIconUrl(entry.kind, isExpanded);
}

/**
 * 根据目录名称和展开状态解析目录图标名称。
 */
function resolveFolderIconName(folderName: string, isExpanded: boolean): string {
  const normalizedName = folderName.toLowerCase();
  const folderNames = isExpanded
    ? materialIconManifest.folderNamesExpanded
    : materialIconManifest.folderNames;
  const fallbackIconName = isExpanded
    ? materialIconManifest.folderExpanded
    : materialIconManifest.folder;

  return folderNames?.[normalizedName] ?? fallbackIconName ?? "folder";
}

/**
 * 按完整文件名、复合扩展名和语言扩展解析文件图标名称。
 */
function resolveFileIconName(fileName: string): string {
  const normalizedName = fileName.toLowerCase();
  const fileNameIcon = materialIconManifest.fileNames?.[normalizedName];

  if (fileNameIcon) {
    return fileNameIcon;
  }

  for (const extension of createExtensionCandidates(normalizedName)) {
    const extensionIcon = materialIconManifest.fileExtensions?.[extension];

    if (extensionIcon) {
      return extensionIcon;
    }

    const fallbackIcon = fallbackExtensionIconNames[extension];

    if (fallbackIcon) {
      return fallbackIcon;
    }
  }

  return materialIconManifest.file ?? "file";
}

/**
 * 为文件名生成从最长到最短的扩展名候选列表。
 */
function createExtensionCandidates(fileName: string): string[] {
  const nameWithoutLeadingDot = fileName.startsWith(".")
    ? fileName.slice(1)
    : fileName;
  const parts = nameWithoutLeadingDot.split(".");

  if (parts.length <= 1) {
    return [];
  }

  return parts.slice(1).map((_, index) => parts.slice(index + 1).join("."));
}

/**
 * 根据 Material 图标名称解析 Vite 打包后的 SVG 资源地址。
 */
function resolveIconUrl(iconName: string): string | undefined {
  const iconFileName = resolveIconFileName(materialIconManifest, iconName);

  if (!iconFileName) {
    return undefined;
  }

  return materialIconUrls[
    `/node_modules/material-icon-theme/icons/${iconFileName}`
  ];
}

/**
 * 从 VS Code 图标主题定义中提取 SVG 文件名。
 */
function resolveIconFileName(
  manifest: Manifest,
  iconName: string,
): string | undefined {
  const iconPath = manifest.iconDefinitions?.[iconName]?.iconPath;

  return iconPath?.split(/[\\/]/).at(-1);
}

/**
 * 在图标映射缺失时返回基础文件或目录图标。
 */
function resolveFallbackIconUrl(
  entryKind: ProjectDirectoryEntry["kind"],
  isExpanded: boolean,
): string {
  const fallbackIconName =
    entryKind === "directory"
      ? resolveFolderIconName("", isExpanded)
      : (materialIconManifest.file ?? "file");

  return resolveIconUrl(fallbackIconName) ?? "";
}

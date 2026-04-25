/**
 * 从目录路径提取用于侧边栏展示的项目名。
 */
export function projectNameFromPath(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/);

  return parts.at(-1) || path;
}

/**
 * 从目录路径生成终端标签标题。
 */
export function terminalTitleFromPath(path: string, index: number): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/).filter(Boolean);
  const suffix = index > 1 ? ` ${index}` : "";

  if (parts.length <= 2) {
    return `${normalizedPath}/${suffix}`.trim();
  }

  return `.../${parts.slice(-2).join("/")}/${suffix}`.trim();
}

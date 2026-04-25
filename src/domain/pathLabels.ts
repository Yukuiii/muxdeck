/**
 * 从目录路径提取用于侧边栏展示的项目名。
 */
export function projectNameFromPath(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/);

  return parts.at(-1) || path;
}

/**
 * 从目录路径生成不带序号的终端标签标题。
 */
export function terminalTitleFromPath(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/).filter(Boolean);

  if (parts.length <= 2) {
    return `${normalizedPath}/`;
  }

  return `.../${parts.slice(-2).join("/")}/`;
}

export interface FileSearchMatch {
  path: string;
  score: number;
}

const MAX_EMPTY_QUERY_RESULTS = 80;

/**
 * 对项目文件路径执行轻量模糊匹配，并返回按分数排序后的结果。
 */
export function rankProjectFilePaths(
  paths: string[],
  query: string,
  limit = 50,
): FileSearchMatch[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return paths.slice(0, Math.min(limit, MAX_EMPTY_QUERY_RESULTS)).map((path, index) => ({
      path,
      score: MAX_EMPTY_QUERY_RESULTS - index,
    }));
  }

  return paths
    .map((path) => scoreProjectFilePath(path, normalizedQuery))
    .filter((match): match is FileSearchMatch => Boolean(match))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, limit);
}

/**
 * 提取路径最后一级名称，供快速打开结果列表展示。
 */
export function fileNameFromPath(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const parts = normalizedPath.split(/[\\/]/).filter(Boolean);

  return parts.at(-1) ?? normalizedPath;
}

/**
 * 提取路径的目录部分，供结果列表展示上下文。
 */
export function fileDirectoryFromPath(path: string): string | undefined {
  const normalizedPath = path.replace(/[\\/]+$/, "");
  const separatorIndex = normalizedPath.lastIndexOf("/");

  if (separatorIndex < 0) {
    return undefined;
  }

  return normalizedPath.slice(0, separatorIndex);
}

/**
 * 为单个文件路径计算搜索分数，优先文件名前缀与包含关系。
 */
function scoreProjectFilePath(path: string, query: string): FileSearchMatch | undefined {
  const normalizedPath = path.toLowerCase();
  const fileName = fileNameFromPath(path).toLowerCase();

  if (fileName === query) {
    return { path, score: 7000 - normalizedPath.length };
  }

  if (fileName.startsWith(query)) {
    return { path, score: 6000 - normalizedPath.length };
  }

  const fileNameIndex = fileName.indexOf(query);

  if (fileNameIndex >= 0) {
    return { path, score: 5200 - fileNameIndex * 10 - normalizedPath.length };
  }

  if (normalizedPath.startsWith(query)) {
    return { path, score: 4200 - normalizedPath.length };
  }

  const pathIndex = normalizedPath.indexOf(query);

  if (pathIndex >= 0) {
    return { path, score: 3600 - pathIndex * 4 - normalizedPath.length };
  }

  const subsequencePenalty = subsequenceGapPenalty(normalizedPath, query);

  if (subsequencePenalty === undefined) {
    return undefined;
  }

  return {
    path,
    score: 2200 - subsequencePenalty - normalizedPath.length,
  };
}

/**
 * 计算 query 作为 subsequence 命中 path 时的间隔惩罚，命中失败返回空。
 */
function subsequenceGapPenalty(path: string, query: string): number | undefined {
  let queryIndex = 0;
  let previousMatchIndex = -1;
  let gapPenalty = 0;

  for (let pathIndex = 0; pathIndex < path.length; pathIndex += 1) {
    if (path[pathIndex] !== query[queryIndex]) {
      continue;
    }

    if (previousMatchIndex >= 0) {
      gapPenalty += pathIndex - previousMatchIndex - 1;
    }

    previousMatchIndex = pathIndex;
    queryIndex += 1;

    if (queryIndex >= query.length) {
      return gapPenalty;
    }
  }

  return undefined;
}

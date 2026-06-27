import path from "node:path";

export const repoRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());

const configuredDataRoot = process.env.NIPAPLAY_DATA_ROOT?.trim();
export const dataRoot = configuredDataRoot
  ? path.resolve(configuredDataRoot)
  : repoRoot;

export function repoPath(...parts: string[]) {
  return safeJoin(repoRoot, ...parts);
}

export function contentPath(...parts: string[]) {
  return safeJoin(dataRoot, ...parts);
}

export function safeJoin(root: string, ...parts: string[]) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...parts);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Path escapes configured root");
  }
  return target;
}

export function candidateContentPaths(...parts: string[]) {
  const dataPath = contentPath(...parts);
  const fallback = repoPath(...parts);
  return dataPath === fallback ? [dataPath] : [dataPath, fallback];
}

export function musicRoot() {
  return process.env.MUSIC_LIBRARY_ROOT?.trim()
    ? path.resolve(process.env.MUSIC_LIBRARY_ROOT)
    : contentPath("music_library_data");
}

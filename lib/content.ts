import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { candidateContentPaths, contentPath, safeJoin } from "./paths";

export type TextBucket = "lyrics" | "song-details";

export const textBuckets: Record<TextBucket, { dir: string; ext: string }> = {
  lyrics: { dir: "lrcs", ext: ".lrc" },
  "song-details": { dir: "song_details", ext: ".txt" }
};

export const jsonFiles: Record<string, string> = {
  releases: "releases.json",
  guides: "guides.json",
  song_ids: "data/song_ids.json"
};

export async function readFirstFile(...parts: string[]) {
  for (const candidate of candidateContentPaths(...parts)) {
    try {
      return {
        path: candidate,
        buffer: await readFile(candidate)
      };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

export async function readJsonFile(name: string) {
  const relative = jsonFiles[name];
  if (!relative) {
    throw new Error("Unknown JSON file");
  }
  const found = await readFirstFile(relative);
  if (!found) {
    return null;
  }
  return JSON.parse(found.buffer.toString("utf8"));
}

export async function writeJsonFile(name: string, value: unknown) {
  const relative = jsonFiles[name];
  if (!relative) {
    throw new Error("Unknown JSON file");
  }
  const target = contentPath(relative);
  await atomicWrite(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
}

export async function listTextBucket(bucket: TextBucket) {
  const config = textBuckets[bucket];
  const dir = contentPath(config.dir);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(config.ext))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        const info = await stat(fullPath);
        return {
          file: entry.name,
          size: info.size,
          updated_at: Math.floor(info.mtimeMs / 1000)
        };
      })
  );
  return files.sort((a, b) => a.file.localeCompare(b.file, "zh-Hans-CN"));
}

export async function readTextBucketFile(bucket: TextBucket, file: string) {
  const config = textBuckets[bucket];
  const safeName = safeFilename(file, config.ext);
  const found = await readFirstFile(config.dir, safeName);
  return found
    ? { file: safeName, content: found.buffer.toString("utf8") }
    : { file: safeName, content: "" };
}

export async function writeTextBucketFile(bucket: TextBucket, file: string, content: string) {
  const config = textBuckets[bucket];
  const safeName = safeFilename(file, config.ext);
  const target = contentPath(config.dir, safeName);
  await atomicWrite(target, content);
  return safeName;
}

export async function deleteTextBucketFile(bucket: TextBucket, file: string) {
  const config = textBuckets[bucket];
  const safeName = safeFilename(file, config.ext);
  await unlink(contentPath(config.dir, safeName));
}

export async function atomicWrite(target: string, data: string | Buffer) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, data);
  await rename(temp, target);
}

export function safeFilename(input: string, ext?: string) {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("\0") || trimmed.includes("..") || /[\\/]/.test(trimmed)) {
    throw new Error("Invalid file name");
  }
  return ext && !trimmed.toLowerCase().endsWith(ext) ? `${trimmed}${ext}` : trimmed;
}

export function safeRelativePath(root: string, relative: string) {
  const normalized = relative.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").includes("..")) {
    throw new Error("Invalid path");
  }
  return safeJoin(root, normalized);
}

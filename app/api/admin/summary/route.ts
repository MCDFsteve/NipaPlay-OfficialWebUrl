import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { readJsonFile } from "@/lib/content";
import { contentPath, dataRoot, repoRoot } from "@/lib/paths";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const [releases, guides, songIds] = await Promise.all([
    readJsonFile("releases").catch(() => []),
    readJsonFile("guides").catch(() => []),
    readJsonFile("song_ids").catch(() => ({}))
  ]);
  return jsonResponse({
    success: true,
    repoRoot,
    dataRoot,
    counts: {
      releases: Array.isArray(releases) ? releases.length : 0,
      guides: guideCount(guides),
      songIds: songIds && typeof songIds === "object" ? Object.keys(songIds).length : 0,
      lyrics: await countDir("lrcs", ".lrc"),
      songDetails: await countDir("song_details", ".txt"),
      playlists: await countDir("cloud_playlists", ".msz"),
      watchProgressUsers: await countDir("watch_progress_data", ".json")
    }
  });
}

function guideCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (!value || typeof value !== "object") {
    return 0;
  }
  return Object.values(value).reduce((total, section) => {
    return total + (Array.isArray(section) ? section.length : 0);
  }, 0);
}

async function countDir(dir: string, ext: string) {
  try {
    const root = contentPath(dir);
    const entries = await readdir(root, { withFileTypes: true });
    let count = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(ext)) continue;
      count++;
      bytes += (await stat(path.join(root, entry.name))).size;
    }
    return { count, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

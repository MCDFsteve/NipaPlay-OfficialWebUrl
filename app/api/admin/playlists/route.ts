import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { safeFilename } from "@/lib/content";
import { contentPath } from "@/lib/paths";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const dir = contentPath("cloud_playlists");
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".msz"))
      .map(async (entry) => {
        const info = await stat(path.join(dir, entry.name));
        return {
          file: entry.name,
          id: entry.name.replace(/\.msz$/i, ""),
          size: info.size,
          updated_at: Math.floor(info.mtimeMs / 1000)
        };
      })
  );
  return jsonResponse({ success: true, files: files.sort((a, b) => a.id.localeCompare(b.id)) });
}

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim();
  const file = form.get("file");
  if (!/^[A-Za-z0-9_]{5,}$/.test(id) || !(file instanceof File)) {
    return jsonResponse({ success: false, message: "缺少有效 ID 或文件" }, 400);
  }
  const target = contentPath("cloud_playlists", safeFilename(`${id}.msz`, ".msz"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return jsonResponse({ success: true });
}

export async function DELETE(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_]{5,}$/.test(id)) {
    return jsonResponse({ success: false, message: "ID 不合法" }, 400);
  }
  await unlink(contentPath("cloud_playlists", `${id}.msz`));
  return jsonResponse({ success: true });
}

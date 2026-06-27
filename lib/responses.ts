import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export function jsonResponse(data: unknown, status = 200, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, status, headers });
}

export function legacyJson(status: number, message: string, payload: Record<string, unknown> = {}) {
  return jsonResponse(
    {
      success: status >= 200 && status < 300,
      message,
      ...payload
    },
    status
  );
}

export function textResponse(body: string, contentType = "text/plain; charset=utf-8", status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType
    }
  });
}

export async function fileResponse(
  filePath: string,
  request: Request,
  initHeaders?: HeadersInit
) {
  const fileStat = await stat(filePath);
  const headers = new Headers(initHeaders);
  headers.set("content-type", headers.get("content-type") ?? mimeType(filePath));
  headers.set("accept-ranges", "bytes");

  const range = request.headers.get("range");
  let status = 200;
  let start = 0;
  let end = fileStat.size - 1;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return legacyJson(416, "非法的 Range 请求");
    }
    if (match[1]) {
      start = Number(match[1]);
    }
    if (match[2]) {
      end = Number(match[2]);
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end) {
      return legacyJson(416, "非法的 Range 请求");
    }
    end = Math.min(end, fileStat.size - 1);
    status = 206;
    headers.set("content-range", `bytes ${start}-${end}/${fileStat.size}`);
  }

  headers.set("content-length", String(end - start + 1));
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status, headers });
  }
  const stream = createReadStream(filePath, { start, end });
  return new Response(Readable.toWeb(stream) as BodyInit, { status, headers });
}

export function notFound(message = "Not found") {
  return jsonResponse({ success: false, message }, 404);
}

export function mimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".appimage": "application/octet-stream",
    ".apk": "application/vnd.android.package-archive",
    ".css": "text/css; charset=utf-8",
    ".deb": "application/vnd.debian.binary-package",
    ".dmg": "application/x-apple-diskimage",
    ".gif": "image/gif",
    ".gz": "application/gzip",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".lrc": "text/plain; charset=utf-8",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".msix": "application/octet-stream",
    ".msz": "application/octet-stream",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".png": "image/png",
    ".rpm": "application/x-rpm",
    ".svg": "image/svg+xml",
    ".tar": "application/x-tar",
    ".txt": "text/plain; charset=utf-8",
    ".wav": "audio/wav",
    ".webp": "image/webp",
    ".zip": "application/zip"
  };
  return map[ext] ?? "application/octet-stream";
}

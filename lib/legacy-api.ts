import crypto from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, readFirstFile, safeFilename, safeRelativePath } from "./content";
import { contentPath, dataRoot, musicRoot, repoPath } from "./paths";
import { fileResponse, jsonResponse, legacyJson, mimeType, textResponse } from "./responses";

const audioExtensions = new Set(["mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wv", "ape"]);
const logShareLifetimeMs = 60 * 60 * 1000;
const maxLogShareBytes = 2 * 1024 * 1024;

export async function htmlFileRoute(fileName: string) {
  const file = await readFirstFile(fileName);
  if (!file) {
    return textResponse("Not found", "text/plain; charset=utf-8", 404);
  }
  return textResponse(file.buffer.toString("utf8"), "text/html; charset=utf-8");
}

export async function jsonFileRoute(fileName: string) {
  const file = await readFirstFile(fileName);
  if (!file) {
    return legacyJson(404, "未找到文件");
  }
  return textResponse(file.buffer.toString("utf8"), "application/json; charset=utf-8");
}

export async function staticFileRoute(request: Request, baseDir: "assets" | "releases", segments: string[]) {
  const relative = segments.join("/");
  for (const root of [dataRoot, repoPath()]) {
    try {
      const target = safeRelativePath(path.join(root, baseDir), relative);
      return await fileResponse(target, request);
    } catch {
      // Try next root.
    }
  }
  return legacyJson(404, "未找到文件");
}

export async function nipaplayLogRoute(request: Request) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  await cleanOldLogShares();

  if (method === "POST") {
    const body = await request.text();
    if (Buffer.byteLength(body) > maxLogShareBytes) {
      return logShareJson({ success: false, error: "日志数据过大" });
    }
    let payload: { logs?: unknown };
    try {
      payload = JSON.parse(body || "{}") as { logs?: unknown };
    } catch {
      return logShareJson({ success: false, error: "JSON 解析失败" });
    }
    if (!Array.isArray(payload.logs)) {
      return logShareJson({ success: false, error: "无效的日志数据" });
    }

    const logId = crypto.randomBytes(8).toString("hex");
    const target = contentPath("nipa_logs", `${logId}.json`);
    await atomicWrite(
      target,
      `${JSON.stringify({ timestamp: Math.floor(Date.now() / 1000), logs: payload.logs }, null, 2)}\n`
    );
    return logShareJson({
      success: true,
      logId,
      viewUrl: `${requestOrigin(request)}/nipaplay.php?id=${logId}`
    });
  }

  if (method !== "GET" && method !== "HEAD") {
    return logShareJson({ success: false, error: "仅支持 GET / POST 请求" }, 405);
  }

  const url = new URL(request.url);
  const logId = (url.searchParams.get("id") ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (!logId) {
    return logShareJson({ success: false, error: "未提供日志ID" });
  }

  const found = await firstExistingPath("nipa_logs", `${logId}.json`);
  if (!found) {
    return logShareJson({ success: false, error: "日志不存在" });
  }

  const rawJson = await readFile(found, "utf8");
  if (url.searchParams.has("raw")) {
    return method === "HEAD"
      ? new Response(null, { status: 200, headers: logShareHeaders("application/json; charset=utf-8") })
      : new Response(rawJson, { status: 200, headers: logShareHeaders("application/json; charset=utf-8") });
  }

  if (method === "HEAD") {
    return new Response(null, { status: 200, headers: logShareHeaders("text/html; charset=utf-8") });
  }
  return new Response(renderLogShareHtml(JSON.parse(rawJson) as LogShareData), {
    status: 200,
    headers: logShareHeaders("text/html; charset=utf-8")
  });
}

export async function cloudPlaylistRoute(request: Request) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  let action = url.searchParams.get("action") ?? (method === "GET" || method === "HEAD" ? "download" : "");
  let cloudId = url.searchParams.get("id") ?? "";

  if (method === "POST") {
    const parsed = await parseBody(request);
    action = parsed.fields.action ?? action;
    cloudId = parsed.fields.id ?? cloudId;
    const validation = validateCloudId(cloudId);
    if (validation) {
      return validation;
    }
    if (action !== "upload") {
      return legacyJson(400, "缺少有效的 action=upload");
    }
    const file = parsed.files.playlist_file;
    const body = file?.buffer ?? parsed.raw;
    if (!body || body.length === 0) {
      return legacyJson(400, "未检测到上传内容");
    }
    const target = contentPath("cloud_playlists", `${cloudId}.msz`);
    await atomicWrite(target, body);
    return legacyJson(200, "上传成功", { id: cloudId, size: body.length });
  }

  if (method !== "GET" && method !== "HEAD") {
    return legacyJson(405, "不支持的请求方法");
  }
  const validation = validateCloudId(cloudId);
  if (validation) {
    return validation;
  }
  if (action !== "download") {
    return legacyJson(400, "缺少有效的 action=download");
  }
  const found = await firstExistingPath("cloud_playlists", `${cloudId}.msz`);
  if (!found) {
    return legacyJson(404, "未找到对应的云歌单");
  }
  return fileResponse(found, request, {
    "content-type": "application/octet-stream",
    "x-playlist-id": cloudId,
    "content-disposition": `attachment; filename="${cloudId}.msz"`
  });
}

export async function lyricsRoute(request: Request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const action = url.searchParams.get("action");
    const wantsJson = url.searchParams.get("format") === "json";
    const file = url.searchParams.get("file");
    if (action === "list" || wantsJson || !file) {
      const files = await listFiles("lrcs", ".lrc");
      return legacyJson(200, "ok", {
        files: files.map((item) => item.file),
        updated_at: Math.floor(Date.now() / 1000)
      });
    }
    try {
      const safeName = safeFilename(file, ".lrc");
      const found = await firstExistingPath("lrcs", safeName);
      if (!found) {
        return legacyJson(404, "未找到指定歌词");
      }
      return fileResponse(found, request, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `inline; filename="${encodeURIComponent(safeName)}"`
      });
    } catch {
      return legacyJson(400, "非法的文件名");
    }
  }

  if (request.method === "POST") {
    const parsed = await parseBody(request);
    if ((parsed.fields.action ?? new URL(request.url).searchParams.get("action")) !== "save") {
      return legacyJson(400, "未知的操作");
    }
    try {
      const safeName = safeFilename(parsed.fields.file ?? "", ".lrc");
      await atomicWrite(contentPath("lrcs", safeName), parsed.fields.content ?? "");
      const info = await stat(contentPath("lrcs", safeName));
      return legacyJson(200, "保存成功", {
        file: safeName,
        bytes: info.size,
        updated_at: Math.floor(info.mtimeMs / 1000)
      });
    } catch {
      return legacyJson(400, "非法的文件名");
    }
  }

  return legacyJson(405, "仅支持 GET / POST 请求");
}

export async function songIdRoute(request: Request) {
  const url = new URL(request.url);
  const storageFile = contentPath("data", "song_ids.json");
  if (request.method === "GET") {
    const storage = await readSongIdStorage();
    if (url.searchParams.get("action") === "list") {
      return legacyJson(200, "ok", { entries: storage, count: Object.keys(storage).length });
    }
    const hashes = [...url.searchParams.getAll("hash"), ...url.searchParams.getAll("hash[]")]
      .map((hash) => sanitizeHash(hash))
      .filter(Boolean) as string[];
    if (hashes.length === 0) {
      return legacyJson(400, "hash 参数格式不正确");
    }
    const result: Record<string, unknown> = {};
    for (const hash of hashes) {
      if (storage[hash]) {
        result[hash] = storage[hash];
      }
    }
    if (hashes.length === 1 && Object.keys(result).length === 0) {
      return legacyJson(404, "未找到对应映射");
    }
    return legacyJson(200, "ok", { entries: result });
  }

  if (request.method === "POST") {
    const parsed = await parseBody(request);
    const fields = parsed.json ?? parsed.fields;
    const hash = sanitizeHash(String(fields.hash ?? ""));
    const neteaseId = Number(fields.netease_id);
    if (!hash) {
      return legacyJson(400, "缺少或非法的 hash 参数");
    }
    if (!Number.isInteger(neteaseId) || neteaseId <= 0) {
      return legacyJson(400, "netease_id 必须为正整数");
    }
    const storage = await readSongIdStorage();
    const entry = {
      hash,
      netease_id: neteaseId,
      title: String(fields.title ?? "").trim(),
      artist: String(fields.artist ?? "").trim(),
      album: String(fields.album ?? "").trim(),
      source: String(fields.source ?? "auto").trim(),
      updated_at: Math.floor(Date.now() / 1000)
    };
    storage[hash] = entry;
    await atomicWrite(storageFile, `${JSON.stringify(storage, null, 2)}\n`);
    return legacyJson(200, "保存成功", { entry });
  }

  return legacyJson(405, "仅支持 GET 与 POST 请求");
}

export async function songDetailRoute(request: Request) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method === "GET") {
    const base = url.searchParams.get("file") || url.searchParams.get("title") || "";
    const file = ensureTxtSuffix(sanitizeTitle(base));
    const found = await firstExistingPath("song_details", file);
    if (!found) {
      return jsonResponse({ success: true, message: "ok", file, exists: false, content: "" }, 200, {
        headers: corsHeaders()
      });
    }
    const content = await readFile(found, "utf8");
    const info = await stat(found);
    return jsonResponse(
      {
        success: true,
        message: "ok",
        file,
        exists: true,
        content,
        updated_at: Math.floor(info.mtimeMs / 1000)
      },
      200,
      { headers: corsHeaders() }
    );
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload) {
      return legacyJson(400, "JSON 解析失败");
    }
    const base = String(payload.file || payload.title || "");
    if (!base) {
      return legacyJson(400, "缺少歌曲标题");
    }
    const file = ensureTxtSuffix(sanitizeTitle(base));
    const target = contentPath("song_details", file);
    const existed = Boolean(await firstExistingPath("song_details", file));
    await atomicWrite(target, String(payload.content ?? ""));
    const info = await stat(target);
    return jsonResponse(
      {
        success: true,
        message: "保存成功",
        file,
        created: !existed,
        content: String(payload.content ?? ""),
        bytes: info.size,
        updated_at: Math.floor(info.mtimeMs / 1000)
      },
      200,
      { headers: corsHeaders() }
    );
  }

  return legacyJson(405, "仅支持 GET / POST 请求");
}

export async function watchProgressRoute(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "只支持POST请求" }, 200, { headers: corsHeaders() });
  }
  const input = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!input) {
    return jsonResponse({ success: false, error: "无效的JSON数据" }, 200, { headers: corsHeaders() });
  }
  const username = String(input.username ?? "").trim();
  if (!username) {
    return jsonResponse({ success: false, error: "缺少用户名参数" }, 200, { headers: corsHeaders() });
  }

  if (input.action === "download") {
    const userData = await loadProgress(username);
    const progress: Record<string, number> = {};
    for (const [key, value] of Object.entries(userData.progress ?? {})) {
      if (value && typeof value === "object" && "position" in value) {
        progress[key] = Number((value as { position: unknown }).position) || 0;
      }
    }
    await logProgress(`下载观看进度: ${username}, 共${Object.keys(progress).length}条记录`);
    return jsonResponse({ success: true, progress }, 200, { headers: corsHeaders() });
  }

  if (input.action === "upload") {
    const episodeId = Number(input.episodeId);
    const animeId = Number(input.animeId);
    const position = Number(input.position);
    if (!Number.isInteger(episodeId) || !Number.isInteger(animeId) || !Number.isFinite(position)) {
      return jsonResponse({ success: false, error: "参数类型错误" }, 200, { headers: corsHeaders() });
    }
    if (episodeId <= 0 || animeId <= 0 || position < 0) {
      return jsonResponse({ success: false, error: "参数值无效" }, 200, { headers: corsHeaders() });
    }
    const userData = await loadProgress(username);
    const key = `${episodeId}_${animeId}`;
    const existing = userData.progress?.[key]?.position ?? 0;
    if (position > existing) {
      userData.progress[key] = {
        position,
        episode_id: episodeId,
        anime_id: animeId,
        client_timestamp: input.timestamp ?? Date.now(),
        updated_at: Math.floor(Date.now() / 1000)
      };
      await saveProgress(username, userData);
      await logProgress(`更新观看进度: ${username}, key=${key}, position=${position}`);
      return jsonResponse({ success: true, message: "观看进度上传成功" }, 200, { headers: corsHeaders() });
    }
    return jsonResponse({ success: true, message: "观看进度已是最新" }, 200, { headers: corsHeaders() });
  }

  return jsonResponse({ success: false, error: "无效的操作类型" }, 200, { headers: corsHeaders() });
}

export async function danmakuProxyRoute(request: Request) {
  if (request.method !== "GET") {
    return legacyJson(405, "仅支持 GET 请求");
  }
  const targetPath = new URL(request.url).searchParams.get("path") ?? "";
  const validationPath = targetPath.split("?")[0];
  if (!targetPath || !validationPath.startsWith("/api/v2/comment/")) {
    return legacyJson(400, "仅允许代理 /api/v2/comment/ 开头的弹幕接口");
  }
  const outgoing = new Headers();
  for (const [from, to] of [
    ["accept", "Accept"],
    ["user-agent", "User-Agent"],
    ["x-appid", "X-AppId"],
    ["x-signature", "X-Signature"],
    ["x-timestamp", "X-Timestamp"],
    ["authorization", "Authorization"]
  ]) {
    const value = request.headers.get(from);
    if (value) {
      outgoing.set(to, value);
    }
  }
  try {
    const upstream = await fetch(`https://api.dandanplay.net${targetPath}`, {
      headers: outgoing,
      cache: "no-store"
    });
    const headers = new Headers();
    for (const name of ["content-type", "x-error-message"]) {
      const value = upstream.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return legacyJson(502, "代理服务器无法连接到弹弹play接口", {
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function musicLibraryRoute(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const code = url.searchParams.get("code") ?? "";
  if (!action) {
    return Response.redirect(new URL("/admin?tab=music", url), 302);
  }
  if (code.toLowerCase() !== (process.env.MUSIC_LIBRARY_CODE ?? "irigas").toLowerCase()) {
    return legacyJson(403, "缺少或非法的神秘代码");
  }

  const root = musicRoot();
  await mkdir(root, { recursive: true });

  if (action === "list") {
    const tracks = await listMusicTracks(root);
    return legacyJson(200, "ok", { tracks });
  }
  if (action === "stream" || action === "cover" || action === "thumbnail") {
    try {
      const target = safeRelativePath(root, decodeURIComponent(url.searchParams.get("path") ?? ""));
      return fileResponse(target, request, { "content-type": mimeType(target) });
    } catch {
      return legacyJson(404, "未找到资源");
    }
  }
  if (action === "upload") {
    if (request.method !== "POST") {
      return legacyJson(405, "仅支持 POST 上传");
    }
    const parsed = await parseBody(request);
    const file = parsed.files.music_file;
    if (!file) {
      return legacyJson(400, "未选择文件");
    }
    const ext = path.extname(file.name).slice(1).toLowerCase();
    if (!audioExtensions.has(ext)) {
      return legacyJson(400, "不支持的音频格式");
    }
    const target = await uniquePath(root, sanitizeUploadName(file.name));
    await writeFile(target, file.buffer);
    const track = await musicTrackEntry(root, target);
    return legacyJson(200, "上传成功", { track });
  }

  return legacyJson(400, "未知操作");
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};
  const files: Record<string, { name: string; type: string; buffer: Buffer }> = {};
  let json: Record<string, unknown> | null = null;
  let raw: Buffer | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        fields[key] = value;
      } else {
        files[key] = {
          name: value.name,
          type: value.type,
          buffer: Buffer.from(await value.arrayBuffer())
        };
      }
    }
  } else if (contentType.includes("application/json")) {
    json = await request.json().catch(() => null);
    if (json) {
      for (const [key, value] of Object.entries(json)) {
        if (typeof value !== "object") {
          fields[key] = String(value ?? "");
        }
      }
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(await request.text());
    for (const [key, value] of params.entries()) {
      fields[key] = value;
    }
  } else {
    raw = Buffer.from(await request.arrayBuffer());
  }

  return { fields, files, json, raw };
}

function validateCloudId(cloudId: string) {
  return /^[A-Za-z0-9_]{5,}$/.test(cloudId)
    ? null
    : legacyJson(400, "ID 需至少 5 位，并且仅能包含字母、数字或下划线");
}

async function firstExistingPath(...parts: string[]) {
  for (const candidate of [contentPath(...parts), repoPath(...parts)]) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function listFiles(dir: string, ext: string) {
  const target = contentPath(dir);
  await mkdir(target, { recursive: true });
  const entries = await readdir(target, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(ext))
      .map(async (entry) => {
        const fullPath = path.join(target, entry.name);
        const info = await stat(fullPath);
        return { file: entry.name, size: info.size, updated_at: Math.floor(info.mtimeMs / 1000) };
      })
  );
}

async function readSongIdStorage() {
  const file = await readFirstFile("data/song_ids.json");
  if (!file) {
    return {} as Record<string, unknown>;
  }
  return JSON.parse(file.buffer.toString("utf8")) as Record<string, unknown>;
}

function sanitizeHash(hash: string) {
  const value = hash.trim().toLowerCase();
  return /^[a-f0-9]{8,}$/.test(value) ? value : null;
}

function sanitizeTitle(title: string) {
  const normalized = title.replace(/[\p{P}\p{S}\s]+/gu, "").trim();
  const fallback = normalized || `untitled_${crc32(title)}`;
  return Array.from(fallback).slice(0, 80).join("");
}

function ensureTxtSuffix(name: string) {
  return name.toLowerCase().endsWith(".txt") ? name : `${name}.txt`;
}

function crc32(input: string) {
  return crypto.createHash("md5").update(input).digest("hex").slice(0, 8);
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept, Origin, User-Agent"
  };
}

type LogShareData = {
  timestamp?: unknown;
  logs?: unknown;
};

type LogShareEntry = Record<string, unknown>;

function logShareJson(payload: Record<string, unknown>, status = 200) {
  return jsonResponse(payload, status, { headers: corsHeaders() });
}

function logShareHeaders(contentType: string) {
  const headers = new Headers(corsHeaders());
  headers.set("content-type", contentType);
  headers.set("cache-control", "no-store");
  return headers;
}

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function cleanOldLogShares() {
  const dir = contentPath("nipa_logs");
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const target = path.join(dir, entry.name);
        try {
          const info = await stat(target);
          if (now - info.mtimeMs > logShareLifetimeMs) {
            await unlink(target);
          }
        } catch {
          // Ignore files deleted by a concurrent cleanup.
        }
      })
  );
}

function renderLogShareHtml(data: LogShareData) {
  const logs = Array.isArray(data.logs) ? data.logs.map(toLogShareEntry) : [];
  const initialJson = JSON.stringify({ logs }).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <title>NipaPlay 日志查看器</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 20px;
      background: #1a1a1a;
      color: #fff;
    }
    .log-entry {
      padding: 8px;
      border-bottom: 1px solid #333;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      overflow-wrap: anywhere;
    }
    .timestamp {
      color: #888;
      margin-right: 10px;
    }
    .level {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      margin-right: 10px;
      font-size: 12px;
      background: #666;
    }
    .level-DEBUG { background: #666; }
    .level-INFO { background: #0066cc; }
    .level-WARN { background: #cc8800; }
    .level-ERROR { background: #cc0000; }
    .tag {
      background: rgba(255,255,255,0.2);
      padding: 2px 6px;
      border-radius: 3px;
      margin-right: 10px;
      font-size: 12px;
    }
    .message {
      margin-left: 10px;
      word-break: break-word;
    }
    .header {
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #333;
    }
    .auto-refresh {
      float: right;
      color: #888;
    }
    @media (max-width: 600px) {
      body { padding: 10px; }
      .log-entry { font-size: 12px; }
      .timestamp { display: block; margin-bottom: 4px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>NipaPlay 日志查看器</h1>
    <div class="auto-refresh">
      <label>
        <input type="checkbox" id="autoRefresh"> 自动刷新
      </label>
    </div>
  </div>
  <div id="logContent">
    ${logs.map(renderLogEntry).join("")}
  </div>
  <script id="initialLogs" type="application/json">${initialJson}</script>
  <script>
    const autoRefreshCheckbox = document.getElementById("autoRefresh");
    const logContent = document.getElementById("logContent");
    let autoRefreshInterval;

    function rawUrl() {
      const url = new URL(window.location.href);
      url.searchParams.set("raw", "1");
      return url.toString();
    }

    function addText(parent, className, value) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = value || "";
      parent.appendChild(span);
    }

    function renderLogs(logs) {
      logContent.textContent = "";
      logs.forEach((log) => {
        const entry = document.createElement("div");
        const level = String(log.level || "INFO").replace(/[^A-Za-z0-9_-]/g, "") || "INFO";
        entry.className = "log-entry";
        addText(entry, "timestamp", new Date(log.timestamp || Date.now()).toTimeString().split(" ")[0]);
        addText(entry, "level level-" + level, String(log.level || "INFO"));
        addText(entry, "tag", String(log.tag || ""));
        addText(entry, "message", String(log.message || ""));
        logContent.appendChild(entry);
      });
    }

    function refreshLogs() {
      fetch(rawUrl(), { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => renderLogs(Array.isArray(data.logs) ? data.logs : []))
        .catch(() => {});
    }

    autoRefreshCheckbox.addEventListener("change", function() {
      if (this.checked) {
        refreshLogs();
        autoRefreshInterval = setInterval(refreshLogs, 5000);
      } else {
        clearInterval(autoRefreshInterval);
      }
    });
  </script>
</body>
</html>`;
}

function renderLogEntry(value: LogShareEntry) {
  const level = stringValue(value.level, "INFO");
  return `<div class="log-entry">
  <span class="timestamp">${escapeHtml(formatLogTimestamp(value.timestamp))}</span>
  <span class="level level-${escapeHtml(levelClass(level))}">${escapeHtml(level)}</span>
  <span class="tag">${escapeHtml(stringValue(value.tag))}</span>
  <span class="message">${escapeHtml(stringValue(value.message))}</span>
</div>`;
}

function toLogShareEntry(value: unknown): LogShareEntry {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as LogShareEntry
    : { message: String(value ?? "") };
}

function stringValue(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

function formatLogTimestamp(value: unknown) {
  const date = new Date(stringValue(value, new Date().toISOString()));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toTimeString().split(" ")[0];
}

function levelClass(level: string) {
  return level.replace(/[^A-Za-z0-9_-]/g, "") || "INFO";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ProgressData = {
  progress: Record<string, {
    position: number;
    episode_id?: number;
    anime_id?: number;
    client_timestamp?: unknown;
    updated_at?: number;
  }>;
  last_updated: number;
};

async function loadProgress(username: string): Promise<ProgressData> {
  const file = progressFile(username);
  try {
    return JSON.parse(await readFile(file, "utf8")) as ProgressData;
  } catch {
    return { progress: {}, last_updated: Math.floor(Date.now() / 1000) };
  }
}

async function saveProgress(username: string, data: ProgressData) {
  data.last_updated = Math.floor(Date.now() / 1000);
  await atomicWrite(progressFile(username), `${JSON.stringify(data, null, 2)}\n`);
}

function progressFile(username: string) {
  return contentPath("watch_progress_data", `${crypto.createHash("md5").update(username).digest("hex")}.json`);
}

async function logProgress(message: string) {
  const target = contentPath("watch_progress_sync.log");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `[${new Date().toISOString()}] ${message}\n`, { flag: "a" });
}

async function listMusicTracks(root: string) {
  const tracks: unknown[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && audioExtensions.has(path.extname(entry.name).slice(1).toLowerCase())) {
        tracks.push(await musicTrackEntry(root, fullPath));
      }
    }
  };
  await walk(root);
  return tracks.sort((a, b) =>
    String((a as { metadata?: { title?: string } }).metadata?.title ?? "").localeCompare(
      String((b as { metadata?: { title?: string } }).metadata?.title ?? ""),
      "zh-Hans-CN"
    )
  );
}

async function musicTrackEntry(root: string, filePath: string) {
  const relative = `/${path.relative(root, filePath).replaceAll(path.sep, "/")}`;
  const metadataPath = filePath.replace(path.extname(filePath), ".json");
  let metadata: Record<string, unknown> | null = null;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
  } catch {
    const info = await stat(filePath);
    metadata = {
      title: path.basename(filePath, path.extname(filePath)),
      filesize: info.size,
      last_modified: Math.floor(info.mtimeMs / 1000)
    };
  }
  return {
    metadata,
    relative_path: relative,
    cover_path: metadata.cover_file ?? null,
    thumbnail_path: metadata.thumbnail_file ?? null
  };
}

function sanitizeUploadName(name: string) {
  const ext = path.extname(name).toLowerCase();
  const base = path
    .basename(name, ext)
    .replace(/[^A-Za-z0-9 _.-]+/g, "_")
    .trim()
    || `track_${Date.now()}`;
  return `${base}${ext}`;
}

async function uniquePath(root: string, fileName: string) {
  let target = safeRelativePath(root, fileName);
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let index = 1;
  while (await exists(target)) {
    target = safeRelativePath(root, `${base}_${index++}${ext}`);
  }
  return target;
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const appDir = path.resolve(process.env.APP_DIR || process.cwd());
const dataRoot = path.resolve(process.env.NIPAPLAY_DATA_ROOT || appDir);
const releaseRepo = process.env.NIPAPLAY_RELEASE_REPO || "AimesSoft/NipaPlay-Reload";
const docsRepo = process.env.NIPAPLAY_DOCS_REPO || releaseRepo;
const assetsRepo = process.env.NIPAPLAY_ASSETS_REPO || releaseRepo;
const branch = process.env.NIPAPLAY_SOURCE_BRANCH || "main";
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const args = new Set(process.argv.slice(2));
const taskArg = process.argv.find((arg) => arg.startsWith("--task="));
const task = taskArg?.split("=")[1] || "all";
const jsonOutput = args.has("--json");

const result = {
  startedAt: new Date().toISOString(),
  appDir,
  dataRoot,
  releaseRepo,
  docsRepo,
  assetsRepo,
  branch,
  tasks: {}
};

const assetMap = [
  ["icon.webp", "icons/icon.png"],
  ["logo.webp", "assets/logo.png"],
  ["hero_main.webp", "others/主页.png"],
  ["feature_media_library.webp", "others/媒体库界面.png"],
  ["feature_playback_ui.webp", "others/播放界面-UI展示.png"],
  ["feature_streaming.webp", "others/流媒体详情页面.png"],
  ["feature_mobile.webp", "others/主页-手机.png"],
  ["gallery_series_list.webp", "others/剧集列表界面.png"],
  ["gallery_series_details.webp", "others/新番详情界面.png"],
  ["gallery_library_management.webp", "others/库管理界面.png"],
  ["gallery_streaming_library.webp", "others/流媒体媒体库.png"]
];

const docOrder = [
  "Documentation-index",
  "Documentation-quick-start",
  "Documentation-installation",
  "Documentation-post-install",
  "Documentation-user-guide",
  "Documentation-server-integration",
  "Documentation-settings",
  "Documentation-js-plugin-api",
  "Documentation-faq",
  "Documentation-troubleshooting",
  "Documentation-privacy",
  "Documentation-release-channels"
];

try {
  await mkdir(dataRoot, { recursive: true });
  await runSelectedTask(task);
  result.finishedAt = new Date().toISOString();
  printResult();
} catch (error) {
  result.finishedAt = new Date().toISOString();
  result.error = error instanceof Error ? error.message : String(error);
  printResult();
  process.exitCode = 1;
}

async function runSelectedTask(selected) {
  switch (selected) {
    case "all":
      await recordTask("releases", syncReleases);
      await recordTask("docs", syncDocs);
      await recordTask("assets", syncAssets);
      return;
    case "releases":
      await recordTask("releases", syncReleases);
      return;
    case "docs":
      await recordTask("docs", syncDocs);
      return;
    case "assets":
      await recordTask("assets", syncAssets);
      return;
    default:
      throw new Error(`Unknown task: ${selected}`);
  }
}

async function recordTask(name, fn) {
  try {
    result.tasks[name] = await fn();
  } catch (error) {
    result.tasks[name] = {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function syncReleases() {
  let release;
  try {
    release = await githubJson(`https://api.github.com/repos/${releaseRepo}/releases/latest`);
  } catch (error) {
    const cached = await readCachedJson("releases.json");
    if (cached) {
      return {
        cached: true,
        version: Array.isArray(cached) ? cached[0]?.version : undefined,
        assetCount: Array.isArray(cached) ? cached.length : undefined,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    throw error;
  }
  const version = release.tag_name;
  if (!version) {
    throw new Error("GitHub latest release has no tag_name");
  }

  const releaseDir = dataPath("releases");
  await mkdir(releaseDir, { recursive: true });

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const manifest = [];
  const downloaded = [];
  const skipped = [];
  const failed = [];

  for (const asset of assets) {
    const name = asset.name;
    const url = asset.browser_download_url;
    if (!name || !url) continue;
    const localPath = safeJoin(releaseDir, name);
    try {
      const existing = await stat(localPath).catch(() => null);
      if (existing && asset.size && existing.size === asset.size) {
        skipped.push(name);
      } else {
        await downloadToFile(url, localPath);
        downloaded.push(name);
      }
      const [osName, icon] = osDetails(name);
      manifest.push({
        name,
        version,
        os: osName,
        icon,
        path: `releases/${name}`
      });
    } catch (error) {
      failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (manifest.length === 0) {
    throw new Error("No release assets could be prepared");
  }

  await writeJsonAtomic(dataPath("releases.json"), manifest);

  const keep = new Set(manifest.map((item) => item.name));
  const removed = [];
  for (const entry of await readdir(releaseDir, { withFileTypes: true })) {
    if (entry.isFile() && !keep.has(entry.name)) {
      await rm(path.join(releaseDir, entry.name), { force: true });
      removed.push(entry.name);
    }
  }

  return {
    version,
    assetCount: manifest.length,
    downloaded,
    skipped,
    removed,
    failed
  };
}

async function syncDocs() {
  let output = {};
  try {
    output = await buildDocsOutput();
  } catch (error) {
    const cached = await readCachedJson("guides.json");
    if (cached) {
      return {
        cached: true,
        categories: docCategoryCounts(cached),
        error: error instanceof Error ? error.message : String(error)
      };
    }
    throw error;
  }

  await writeJsonAtomic(dataPath("guides.json"), output.value);
  return {
    categories: docCategoryCounts(output.value),
    failed: output.failed
  };
}

async function buildDocsOutput() {
  const output = {};
  const failed = [];
  for (const directory of ["Documentation", "CONTRIBUTING_GUIDE"]) {
    const files = await listMarkdownFiles(directory);
    const guides = [];
    for (const file of files) {
      try {
        const markdown = await fetchRepoFileText(docsRepo, file.path, file.download_url);
        const content = convertMarkdownLinks(markdown, file.path);
        const id = file.path.replace(/\//g, "-").replace(/\.md$/i, "");
        guides.push({
          id,
          name: markdownTitle(content, file.path),
          content
        });
      } catch (error) {
        failed.push({ path: file.path, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const key = directory.toLowerCase().replaceAll("-", "_");
    if (key === "documentation") {
      const orderMap = new Map(docOrder.map((id, index) => [id, index]));
      guides.sort((a, b) => {
        const left = orderMap.get(a.id) ?? docOrder.length;
        const right = orderMap.get(b.id) ?? docOrder.length;
        return left === right ? a.id.localeCompare(b.id) : left - right;
      });
    } else {
      guides.sort((a, b) => a.id.localeCompare(b.id));
    }
    output[key] = guides;
  }

  return { value: output, failed };
}

async function syncAssets() {
  const assetsDir = dataPath("assets");
  await mkdir(assetsDir, { recursive: true });
  const updated = [];
  const unchanged = [];
  const failed = [];

  for (const [targetName, sourcePath] of assetMap) {
    const target = path.join(assetsDir, targetName);
    try {
      const sourceBuffer = await fetchRepoFileBuffer(assetsRepo, sourcePath);
      const sourceHash = sha256(sourceBuffer);
      const hashFile = `${target}.source.sha256`;
      const previousHash = await readFile(hashFile, "utf8").catch(() => "");
      if (previousHash.trim() === sourceHash && await exists(target)) {
        unchanged.push(targetName);
        continue;
      }
      await convertToWebp(sourceBuffer, target);
      await writeFile(hashFile, `${sourceHash}\n`);
      updated.push(targetName);
    } catch (error) {
      failed.push({ name: targetName, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { updated, unchanged, failed };
}

async function readCachedJson(relativePath) {
  for (const root of [dataRoot, appDir]) {
    try {
      return JSON.parse(await readFile(safeJoin(root, relativePath), "utf8"));
    } catch {
      // Try the next location.
    }
  }
  return null;
}

function docCategoryCounts(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, section]) => [key, Array.isArray(section) ? section.length : 0])
  );
}

async function listMarkdownFiles(directory) {
  const files = [];
  const visit = async (dir) => {
    const contents = await githubJson(`https://api.github.com/repos/${docsRepo}/contents/${encodeURIComponentPath(dir)}?ref=${encodeURIComponent(branch)}`);
    for (const item of contents) {
      if (item.type === "dir") {
        await visit(item.path);
      } else if (item.type === "file" && item.name.endsWith(".md")) {
        files.push(item);
      }
    }
  };
  await visit(directory);
  return files;
}

function convertMarkdownLinks(content, currentFilePath) {
  return content.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+\.md)(#[^)]*)?\)/g, (_match, text, target, anchor = "") => {
    const currentDir = path.posix.dirname(currentFilePath);
    const absolute = path.posix.normalize(path.posix.join(currentDir, target));
    const id = absolute.replace(/\//g, "-").replace(/\.md$/i, "");
    return `[${text}](#${id}${anchor})`;
  });
}

function markdownTitle(content, fallbackPath) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(fallbackPath, ".md").replaceAll("-", " ").replaceAll("_", " ");
}

async function githubJson(url) {
  const response = await fetchWithRetry(url, {
    headers: githubHeaders()
  });
  return response.json();
}

async function fetchRepoFileText(repo, filePath, rawUrl) {
  const buffer = await fetchRepoFileBuffer(repo, filePath, rawUrl);
  return buffer.toString("utf8");
}

async function fetchRepoFileBuffer(repo, filePath, rawUrl) {
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(branch)}`;
  try {
    const metadata = await githubJson(apiUrl);
    if (metadata.content && metadata.encoding === "base64") {
      return Buffer.from(String(metadata.content).replace(/\s/g, ""), "base64");
    }
    return curlBuffer(apiUrl, {
      Accept: "application/vnd.github.raw",
      "User-Agent": "nipaplay-official-site-sync",
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {})
    });
  } catch (error) {
    if (!rawUrl) {
      throw error;
    }
  }
  if (!rawUrl) {
    throw new Error(`No downloadable content for ${filePath}`);
  }
  return fetchUrlBuffer(rawUrl);
}

async function fetchUrlBuffer(url) {
  const response = await fetchWithRetry(url, { headers: githubHeaders(false) });
  return Buffer.from(await response.arrayBuffer());
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastError;
  for (let index = 0; index < attempts; index++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.GITHUB_FETCH_TIMEOUT_MS || 30000));
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (index + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function curlBuffer(url, headers = {}) {
  const args = ["-L", "--fail", "--silent", "--show-error", "--connect-timeout", "20", "--max-time", "120"];
  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }
  args.push(url);
  const run = spawnSync("curl", args, {
    maxBuffer: 100 * 1024 * 1024
  });
  if (run.status !== 0) {
    throw new Error(run.stderr?.toString("utf8") || `curl exited with ${run.status}`);
  }
  return run.stdout;
}

async function downloadToFile(url, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  const response = await fetchWithRetry(url, { headers: githubHeaders(false) });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temp));
  await rename(temp, target);
}

async function convertToWebp(buffer, target) {
  const tempDir = await mkdir(path.join(os.tmpdir(), `nipaplay-assets-${process.pid}`), { recursive: true }).then(() =>
    path.join(os.tmpdir(), `nipaplay-assets-${process.pid}`)
  );
  const input = path.join(tempDir, `${crypto.randomUUID()}.source`);
  const output = `${target}.${process.pid}.tmp.webp`;
  await writeFile(input, buffer);
  await mkdir(path.dirname(target), { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const run = spawnSync(ffmpeg, ["-i", input, "-hide_banner", "-loglevel", "error", "-c:v", "libwebp", "-quality", "85", "-y", output], {
    encoding: "utf8"
  });
  await rm(input, { force: true });
  if (run.status !== 0) {
    await rm(output, { force: true });
    throw new Error(run.stderr || `ffmpeg exited with ${run.status}`);
  }
  await rename(output, target);
}

function githubHeaders(api = true) {
  const headers = {
    "user-agent": "nipaplay-official-site-sync"
  };
  if (api) {
    headers.accept = "application/vnd.github+json";
    headers["x-github-api-version"] = "2022-11-28";
  }
  if (githubToken) {
    headers.authorization = `Bearer ${githubToken}`;
  }
  return headers;
}

function osDetails(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("windows")) return ["Windows", "ri-window-fill"];
  if (lower.includes("macos") || lower.endsWith(".dmg")) return ["macOS", "ri-apple-fill"];
  if (lower.includes("linux") || lower.endsWith(".appimage") || lower.endsWith(".deb") || lower.endsWith(".rpm")) return ["Linux", "ri-ubuntu-fill"];
  if (lower.includes("android") || lower.endsWith(".apk")) return ["Android", "ri-android-fill"];
  if (lower.includes("ios") || lower.endsWith(".ipa")) return ["iOS", "ri-apple-fill"];
  return ["Generic", "ri-download-2-line"];
}

function dataPath(...parts) {
  return safeJoin(dataRoot, ...parts);
}

function safeJoin(root, ...parts) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...parts);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Path escapes root");
  }
  return target;
}

function encodeURIComponentPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function writeJsonAtomic(target, value) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, target);
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function printResult() {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("--- NipaPlay Official Content Sync ---");
    console.log(JSON.stringify(result, null, 2));
  }
}

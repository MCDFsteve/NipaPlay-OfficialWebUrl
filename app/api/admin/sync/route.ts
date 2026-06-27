import { spawn } from "node:child_process";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { dataRoot, repoRoot } from "@/lib/paths";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTasks = new Set(["all", "releases", "docs", "assets"]);

export async function POST(request: Request) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  const payload = await request.json().catch(() => ({})) as { task?: string };
  const task = payload.task || "all";
  if (!allowedTasks.has(task)) {
    return jsonResponse({ success: false, message: "未知同步任务" }, 400);
  }

  const result = await runSync(task);
  return jsonResponse(result, result.success ? 200 : 500);
}

function runSync(task: string) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts/sync-official-content.mjs"), `--task=${task}`, "--json"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        APP_DIR: repoRoot,
        NIPAPLAY_DATA_ROOT: dataRoot
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      const parsed = tryParseJson(stdout);
      resolve({
        success: code === 0,
        code,
        result: parsed,
        stdout: parsed ? undefined : stdout.slice(-8000),
        stderr: stderr.slice(-8000)
      });
    });
  });
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

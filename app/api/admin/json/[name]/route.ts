import { requireAdmin } from "@/lib/auth";
import { jsonFiles, readJsonFile, writeJsonFile } from "@/lib/content";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

export async function GET(request: Request, context: Params) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { name } = await context.params;
  if (!jsonFiles[name]) {
    return jsonResponse({ success: false, message: "未知 JSON 文件" }, 404);
  }
  const data = await readJsonFile(name);
  return jsonResponse({ success: true, name, data });
}

export async function PUT(request: Request, context: Params) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { name } = await context.params;
  if (!jsonFiles[name]) {
    return jsonResponse({ success: false, message: "未知 JSON 文件" }, 404);
  }
  const payload = await request.json().catch(() => null) as { data?: unknown } | null;
  if (!payload || !("data" in payload)) {
    return jsonResponse({ success: false, message: "请求体缺少 data" }, 400);
  }
  await writeJsonFile(name, payload.data);
  return jsonResponse({ success: true });
}

import { requireAdmin } from "@/lib/auth";
import {
  deleteTextBucketFile,
  listTextBucket,
  readTextBucketFile,
  textBuckets,
  writeTextBucketFile,
  type TextBucket
} from "@/lib/content";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ bucket: string }> };

function validBucket(bucket: string): bucket is TextBucket {
  return bucket in textBuckets;
}

export async function GET(request: Request, context: Params) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { bucket } = await context.params;
  if (!validBucket(bucket)) {
    return jsonResponse({ success: false, message: "未知文本目录" }, 404);
  }
  const file = new URL(request.url).searchParams.get("file");
  if (file) {
    return jsonResponse({ success: true, ...(await readTextBucketFile(bucket, file)) });
  }
  return jsonResponse({ success: true, files: await listTextBucket(bucket) });
}

export async function POST(request: Request, context: Params) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { bucket } = await context.params;
  if (!validBucket(bucket)) {
    return jsonResponse({ success: false, message: "未知文本目录" }, 404);
  }
  const payload = await request.json().catch(() => null) as { file?: string; content?: string } | null;
  if (!payload?.file) {
    return jsonResponse({ success: false, message: "缺少文件名" }, 400);
  }
  const file = await writeTextBucketFile(bucket, payload.file, payload.content ?? "");
  return jsonResponse({ success: true, file });
}

export async function DELETE(request: Request, context: Params) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { bucket } = await context.params;
  if (!validBucket(bucket)) {
    return jsonResponse({ success: false, message: "未知文本目录" }, 404);
  }
  const file = new URL(request.url).searchParams.get("file");
  if (!file) {
    return jsonResponse({ success: false, message: "缺少文件名" }, 400);
  }
  await deleteTextBucketFile(bucket, file);
  return jsonResponse({ success: true });
}

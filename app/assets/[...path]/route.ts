import { staticFileRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Params) {
  const { path } = await context.params;
  return staticFileRoute(request, "assets", path);
}

export async function HEAD(request: Request, context: Params) {
  return GET(request, context);
}

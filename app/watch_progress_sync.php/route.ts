import { watchProgressRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return watchProgressRoute(request);
}

export function OPTIONS(request: Request) {
  return watchProgressRoute(request);
}

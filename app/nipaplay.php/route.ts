import { nipaplayLogRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return nipaplayLogRoute(request);
}

export function HEAD(request: Request) {
  return nipaplayLogRoute(request);
}

export function POST(request: Request) {
  return nipaplayLogRoute(request);
}

export function OPTIONS(request: Request) {
  return nipaplayLogRoute(request);
}

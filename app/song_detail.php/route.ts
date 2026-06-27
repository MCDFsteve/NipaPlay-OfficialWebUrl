import { songDetailRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return songDetailRoute(request);
}

export function POST(request: Request) {
  return songDetailRoute(request);
}

export function OPTIONS(request: Request) {
  return songDetailRoute(request);
}

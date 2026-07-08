import { cloudPlaylistRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return cloudPlaylistRoute(request);
}

export function HEAD(request: Request) {
  return cloudPlaylistRoute(request);
}

export function POST(request: Request) {
  return cloudPlaylistRoute(request);
}

export function OPTIONS(request: Request) {
  return cloudPlaylistRoute(request);
}

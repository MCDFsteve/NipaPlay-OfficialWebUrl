import { musicLibraryRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return musicLibraryRoute(request);
}

export function POST(request: Request) {
  return musicLibraryRoute(request);
}

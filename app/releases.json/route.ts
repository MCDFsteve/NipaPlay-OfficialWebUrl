import { jsonFileRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return jsonFileRoute("releases.json");
}

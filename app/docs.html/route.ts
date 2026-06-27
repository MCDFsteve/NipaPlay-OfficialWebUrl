import { htmlFileRoute } from "@/lib/legacy-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return htmlFileRoute("docs.html");
}

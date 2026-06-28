import { getDailyRandomRecommendations } from "@/lib/random-recommendations";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Content-Type, Accept, Origin, User-Agent",
  "cache-control": "public, max-age=300, s-maxage=300"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function GET() {
  try {
    return jsonResponse(await getDailyRandomRecommendations(), 200, { headers });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        message: "随机推荐生成失败",
        error: error instanceof Error ? error.message : String(error)
      },
      502,
      { headers }
    );
  }
}

export async function HEAD() {
  return new Response(null, { status: 200, headers });
}

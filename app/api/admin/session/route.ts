import { checkPassword, clearSessionCookie, createSessionCookie, isAdminRequest } from "@/lib/auth";
import { jsonResponse } from "@/lib/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return jsonResponse({ authenticated: isAdminRequest(request) });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as { password?: string } | null;
  if (!payload?.password || !checkPassword(payload.password)) {
    return jsonResponse({ success: false, message: "密码不正确" }, 401);
  }
  return jsonResponse(
    { success: true },
    200,
    {
      headers: {
        "set-cookie": createSessionCookie()
      }
    }
  );
}

export function DELETE() {
  return jsonResponse(
    { success: true },
    200,
    {
      headers: {
        "set-cookie": clearSessionCookie()
      }
    }
  );
}

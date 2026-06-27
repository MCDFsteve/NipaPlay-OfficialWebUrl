import crypto from "node:crypto";
import { jsonResponse } from "./responses";

const cookieName = "nipaplay_admin_session";
const maxAgeSeconds = 60 * 60 * 24 * 7;

function adminPassword() {
  return process.env.ADMIN_PASSWORD ?? process.env.NIPAPLAY_ADMIN_PASSWORD ?? "";
}

function authSecret() {
  return process.env.AUTH_SECRET ?? adminPassword() ?? "development-secret";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

function parseCookies(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({ iat: Date.now() })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;
  return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function isAdminRequest(request: Request) {
  const token = parseCookies(request)[cookieName];
  if (!token) {
    return false;
  }
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return false;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iat?: number };
    return typeof decoded.iat === "number" && Date.now() - decoded.iat <= maxAgeSeconds * 1000;
  } catch {
    return false;
  }
}

export function checkPassword(password: string) {
  const expected = adminPassword();
  if (!expected) {
    return false;
  }
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireAdmin(request: Request) {
  if (isAdminRequest(request)) {
    return null;
  }
  return jsonResponse({ success: false, message: "Unauthorized" }, 401);
}

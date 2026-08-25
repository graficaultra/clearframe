import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";

// ---------------------------------------------------------------------------
// Database (service role — server only). All portal reads go through
// SECURITY DEFINER functions that never select internal fields.
// ---------------------------------------------------------------------------

export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Signed download URLs for the private "project-files" bucket. Generated
// server-side per request with the service role — the bucket itself has no
// public read, so a leaked storage_path alone grants nothing.
export async function signFileUrl(storagePath: string, expiresInSeconds = 300) {
  const { data, error } = await db.storage
    .from("project-files")
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Portal session — short-lived signed JWT in an httpOnly cookie.
// ---------------------------------------------------------------------------

const secret = new TextEncoder().encode(process.env.PORTAL_SESSION_SECRET!);

export type PortalSession = { projectId: string; slug: string };

export async function signSession(session: PortalSession): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySession(token: string | undefined): Promise<PortalSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.projectId === "string" && typeof payload.slug === "string") {
      return { projectId: payload.projectId, slug: payload.slug };
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieName(slug: string) {
  return `klar_portal_${slug}`;
}

// ---------------------------------------------------------------------------
// Rate limiting for access-code attempts.
// In-memory sliding window: fine for a single-instance MVP.
// TODO before scale: swap for Upstash Redis (@upstash/ratelimit) so limits
// hold across serverless instances.
// ---------------------------------------------------------------------------

const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 8;

export function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_ATTEMPTS) {
    attempts.set(key, list);
    return false;
  }
  list.push(now);
  attempts.set(key, list);
  return true;
}
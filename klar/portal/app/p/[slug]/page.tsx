import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  db,
  rateLimitOk,
  sessionCookieName,
  signSession,
  verifySession,
} from "@/lib/server";

export const dynamic = "force-dynamic";

async function enter(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "");

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimitOk(`${ip}:${slug}`)) {
    redirect(`/p/${slug}?e=rate`);
  }

  const { data: projectId } = await db.rpc("portal_verify_access", {
    p_slug: slug,
    p_code: code,
  });

  if (!projectId) {
    redirect(`/p/${slug}?e=code`);
  }

  const token = await signSession({ projectId: projectId as string, slug });
  cookies().set(sessionCookieName(slug), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/p/${slug}`,
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(`/p/${slug}/project`);
}

export default async function Gate({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { e?: string };
}) {
  // Already unlocked? Straight to the project.
  const existing = await verifySession(
    cookies().get(sessionCookieName(params.slug))?.value
  );
  if (existing && existing.slug === params.slug) {
    redirect(`/p/${params.slug}/project`);
  }

  return (
    <main className="shell gate">
      <span className="eyebrow">Project portal</span>
      <h1>Enter your access code</h1>
      <p className="hint">You received it from your studio.</p>
      <form action={enter} className="form-row" style={{ maxWidth: 320 }}>
        <input type="hidden" name="slug" value={params.slug} />
        <input
          name="code"
          placeholder="XXXXXXXX"
          autoComplete="off"
          autoFocus
          maxLength={12}
          required
          aria-label="Access code"
        />
        <button type="submit">Open project</button>
      </form>
      {searchParams.e === "code" && (
        <p className="error">That code didn’t work. Check it and try again.</p>
      )}
      {searchParams.e === "rate" && (
        <p className="error">Too many attempts. Wait a few minutes, then try again.</p>
      )}
    </main>
  );
}

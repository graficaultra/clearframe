import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, sessionCookieName, verifySession } from "@/lib/server";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!slug || !workspaceId) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const session = await verifySession(cookies().get(sessionCookieName(slug))?.value);
  if (!session || session.slug !== slug) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await db.rpc("portal_get_workspace_tasks", {
    p_session_project_id: session.projectId,
    p_workspace_id: workspaceId,
  });
  if (error) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }

  // RPC returns { boards: [...], tasks: [...] } — boards drive dynamic
  // column name/color/order (user-editable in the plugin), tasks reference
  // board_id rather than a fixed status.
  return NextResponse.json(data ?? { boards: [], tasks: [] });
}

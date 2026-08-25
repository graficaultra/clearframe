import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, sessionCookieName, verifySession } from "@/lib/server";
import { ThemeToggle } from "@/app/theme-toggle";
import { WorkspaceBoard } from "@/app/workspace-board";

export const dynamic = "force-dynamic";

export default async function Project({ params }: { params: { slug: string } }) {
  const session = await verifySession(
    cookies().get(sessionCookieName(params.slug))?.value
  );
  if (!session || session.slug !== params.slug) redirect(`/p/${params.slug}`);

  const { data } = await db.rpc("portal_get_client", {
    p_project_id: session.projectId,
  });
  if (!data) redirect(`/p/${params.slug}`);

  const { client, studio, welcome_message, project_lead, workspaces, current_workspace_id } =
    data as any;

  return (
    <main className="shell wide" style={{ ["--accent" as any]: studio.accent_color }}>
      <div className="header-clamp">
        <header className="studio-row">
          <div className="studio-row-brand">
            {studio.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logo_url} alt={studio.name} />
            ) : (
              <span>{studio.name}</span>
            )}
          </div>
          <ThemeToggle />
        </header>

        <span className="eyebrow">{client.name}</span>
        <h1>Project status</h1>
        {welcome_message && <p className="welcome">{welcome_message}</p>}
        {project_lead && (
          <div className="lead-row">
            {project_lead.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={project_lead.photo_url} alt={project_lead.name} className="lead-avatar" />
            ) : (
              <span className="lead-avatar lead-avatar-fallback">
                {project_lead.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <div className="lead-role">Project Lead</div>
              <div className="lead-name">{project_lead.name}</div>
            </div>
          </div>
        )}
      </div>

      {workspaces.length === 0 ? (
        <section>
          <p className="welcome">No workspaces yet.</p>
        </section>
      ) : (
        <WorkspaceBoard
          slug={params.slug}
          workspaces={workspaces}
          initialWorkspaceId={current_workspace_id}
        />
      )}

      <footer>
        <span>{studio.name}</span>
        <span>Private project portal</span>
      </footer>
    </main>
  );
}

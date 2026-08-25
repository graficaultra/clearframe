-- klar · Migration 0005
-- Back to three tiers: Client -> Workspace (was "project") -> Tasks (kanban cards).
-- Files move from project-level to task-level. Projects drop their own
-- kanban status/description/notes — those now live on tasks.

create type task_status as enum ('backlog', 'planning', 'in_progress', 'review', 'completed');

create table tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects (id) on delete cascade,
  title          text not null,
  description    text,          -- client-visible
  internal_note  text,          -- never exposed to the portal
  status         task_status not null default 'backlog',
  deadline       date,
  position       double precision not null default 0,
  created_at     timestamptz not null default now()
);

create index on tasks (project_id, status, position);

alter table tasks enable row level security;

create policy tasks_all on tasks
  for all using (owns_project(project_id)) with check (owns_project(project_id));

-- ---------------------------------------------------------------------------
-- Move files from projects to tasks.
-- ---------------------------------------------------------------------------

alter table project_files add column task_id uuid references tasks (id) on delete cascade;

-- Existing rows (if any) had no task to attach to under the new model;
-- projects.id-based rows become orphaned metadata-wise but are harmless —
-- fresh uploads all go through task_id from here on.
alter table project_files alter column project_id drop not null;
alter table project_files rename to task_files;

drop policy if exists project_files_all on task_files;
create policy task_files_all on task_files
  for all using (
    task_id is not null and exists (
      select 1 from tasks t where t.id = task_files.task_id and owns_project(t.project_id)
    )
  )
  with check (
    task_id is not null and exists (
      select 1 from tasks t where t.id = task_files.task_id and owns_project(t.project_id)
    )
  );

create index on task_files (task_id);

-- Storage bucket policies already reference is_studio_owner() via folder
-- path {studio_id}/... which is unchanged — task uploads use the same
-- "project-files" bucket with path {studio_id}/{task_id}/{uuid}-{filename}.

-- ---------------------------------------------------------------------------
-- Projects (workspaces) no longer carry their own kanban fields.
-- Keep the columns for now (harmless, avoids a destructive drop) but the
-- app stops reading/writing project.status/description/internal_note/deadline.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Portal: client selects a workspace (project), sees that workspace's task
-- board. portal_get_client now returns the client's workspaces (id, name)
-- and, for the currently-anchored workspace, its task board.
-- ---------------------------------------------------------------------------

drop function if exists portal_get_client(uuid);

create function portal_get_client(p_project_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'client', jsonb_build_object('name', c.name),
    'studio', jsonb_build_object(
      'name', s.name,
      'logo_url', s.logo_url,
      'accent_color', s.accent_color
    ),
    'welcome_message', c.welcome_message,
    'project_lead', (
      select jsonb_build_object('name', tm.name, 'photo_url', tm.photo_url)
      from team_members tm where tm.id = c.project_lead_id
    ),
    'workspaces', coalesce((
      select jsonb_agg(jsonb_build_object('id', p2.id, 'name', p2.name) order by p2.position)
      from projects p2
      where p2.client_id = c.id and p2.archived_at is null
    ), '[]'::jsonb),
    'current_workspace_id', p.id
  )
  from projects p
  join studios s on s.id = p.studio_id
  join clients c on c.id = p.client_id
  where p.id = p_project_id and p.archived_at is null;
$$;

revoke execute on function portal_get_client(uuid) from public, anon, authenticated;
grant execute on function portal_get_client(uuid) to service_role;

-- Task board for one workspace, scoped to a session's project_id so a client
-- can't fetch another studio's tasks by guessing a workspace id — the portal
-- server verifies p_project_id belongs to the same client as the session
-- before calling this (see portal_get_workspace_tasks below for the check).

create function portal_get_workspace_tasks(p_session_project_id uuid, p_workspace_id uuid)
returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'status', t.status,
    'description', t.description,
    'deadline', t.deadline,
    'created_at', t.created_at,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', tf.id,
        'file_name', tf.file_name,
        'size_bytes', tf.size_bytes,
        'storage_path', tf.storage_path
      ) order by tf.created_at)
      from task_files tf where tf.task_id = t.id
    ), '[]'::jsonb)
  ) order by t.position), '[]'::jsonb)
  from tasks t
  where t.project_id = p_workspace_id
    -- same-client guard: the requested workspace must belong to the same
    -- client as the session's original (anchor) workspace
    and exists (
      select 1 from projects anchor
      join projects target on target.client_id = anchor.client_id
      where anchor.id = p_session_project_id and target.id = p_workspace_id
    );
$$;

revoke execute on function portal_get_workspace_tasks(uuid, uuid) from public, anon, authenticated;
grant execute on function portal_get_workspace_tasks(uuid, uuid) to service_role;

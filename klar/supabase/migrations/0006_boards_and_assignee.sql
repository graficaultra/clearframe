-- klar · Migration 0006
-- Boards (kanban columns) become per-workspace, user-editable rows instead of
-- a fixed task_status enum: rename, reorder, recolor, add, delete.
-- Tasks gain updated_at (drives the card's "2d / 6h" duration label, which
-- reflects last edit — not creation, not deadline).
-- Workspaces gain a single assignee (one team member "owns" the whole board,
-- shown top-right in the plugin UI and switchable via the same popover).

-- ---------------------------------------------------------------------------
-- Boards: replaces task_status enum. Every workspace gets its own board rows
-- so per-studio color/rename/reorder edits never leak across workspaces.
-- ---------------------------------------------------------------------------

create table boards (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name       text not null,
  color      text not null, -- hex, e.g. '#bf9ff2' — swatch-picker value, task cards inherit it
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

create index on boards (project_id, position);

alter table boards enable row level security;

create policy boards_all on boards
  for all using (owns_project(project_id)) with check (owns_project(project_id));

-- Seed function: called once per new workspace (see createWorkspace in api.ts)
-- to populate the five default boards in the app's known default colors.
create function seed_default_boards(p_project_id uuid) returns void
language sql volatile security definer set search_path = public as $$
  insert into boards (project_id, name, color, position) values
    (p_project_id, 'Backlog',     '#bf9ff2', 0),
    (p_project_id, 'Planning',    '#16ad70', 1),
    (p_project_id, 'In Progress', '#f78d2d', 2),
    (p_project_id, 'Review',      '#ea546f', 3),
    (p_project_id, 'Completed',   '#8e8e93', 4);
$$;

revoke execute on function seed_default_boards(uuid) from public, anon, authenticated;
grant execute on function seed_default_boards(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tasks: swap the fixed status enum for a board_id FK. Add updated_at,
-- touched on every task edit (title/description/board move/etc) — this is
-- what the card's duration label ("2d", "6h") is computed from client-side.
-- ---------------------------------------------------------------------------

alter table tasks add column board_id uuid references boards (id) on delete set null;
alter table tasks add column updated_at timestamptz not null default now();

-- Backfill: create default boards for every existing workspace, then map
-- each task's old enum status onto the matching new board row.
do $$
declare
  ws record;
begin
  for ws in select id from projects loop
    perform seed_default_boards(ws.id);
  end loop;
end $$;

update tasks t
set board_id = b.id
from boards b
where b.project_id = t.project_id
  and b.name = case t.status
    when 'backlog' then 'Backlog'
    when 'planning' then 'Planning'
    when 'in_progress' then 'In Progress'
    when 'review' then 'Review'
    when 'completed' then 'Completed'
  end;

-- status stays for one release as a harmless read-only artifact (avoids a
-- destructive drop mid-migration); the app stops reading/writing it as of
-- this release and drops the column in a later cleanup migration.

create index on tasks (project_id, board_id, position);

-- Keep updated_at current automatically so a plain `update tasks set ...`
-- from anywhere (including future features) can't forget to touch it.
create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on tasks
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Workspaces: single assignee, shown/switched at the top of the board.
-- ---------------------------------------------------------------------------

alter table projects add column assignee_id uuid references team_members (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Portal read functions: include board name/color instead of raw status,
-- and expose the workspace's assignee for display.
-- ---------------------------------------------------------------------------

drop function if exists portal_get_workspace_tasks(uuid, uuid);

create function portal_get_workspace_tasks(p_session_project_id uuid, p_workspace_id uuid)
returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'boards', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'color', b.color) order by b.position)
      from boards b
      where b.project_id = p_workspace_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'board_id', t.board_id,
        'description', t.description,
        'deadline', t.deadline,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) order by t.position)
      from tasks t
      where t.project_id = p_workspace_id
    ), '[]'::jsonb)
  )
  where exists (
    select 1 from projects anchor
    join projects target on target.client_id = anchor.client_id
    where anchor.id = p_session_project_id and target.id = p_workspace_id
  );
$$;

revoke execute on function portal_get_workspace_tasks(uuid, uuid) from public, anon, authenticated;
grant execute on function portal_get_workspace_tasks(uuid, uuid) to service_role;

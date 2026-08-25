-- klar · Migration 0002
-- Projects become the kanban unit (cards move Backlog -> ... -> Completed).
-- Tasks and client comments are removed from the MVP scope per product decision.

create type project_status as enum ('backlog', 'planning', 'in_progress', 'review', 'completed');

alter table projects
  add column status project_status not null default 'backlog',
  add column description   text, -- client-visible
  add column internal_note text, -- never exposed to the portal
  add column deadline      date,
  add column position      double precision not null default 0;

drop table if exists tasks cascade;
drop table if exists comments cascade;
drop type if exists task_status;
drop type if exists comment_author;

-- ---------------------------------------------------------------------------
-- Portal read function — rebuilt for the project-as-card model.
-- Internal fields are excluded at the query level, same as before.
-- ---------------------------------------------------------------------------

drop function if exists portal_get_project(uuid);
drop function if exists portal_add_comment(uuid, text, text);

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
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p2.id,
        'name', p2.name,
        'status', p2.status,
        'description', p2.description,
        'deadline', p2.deadline
      ) order by p2.position)
      from projects p2
      where p2.client_id = c.id and p2.archived_at is null
    ), '[]'::jsonb)
  )
  from projects p
  join studios s on s.id = p.studio_id
  join clients c on c.id = p.client_id
  where p.id = p_project_id and p.archived_at is null;
$$;

revoke execute on function portal_get_client(uuid) from public, anon, authenticated;
grant execute on function portal_get_client(uuid) to service_role;

-- clients need a welcome message field too, now that the portal is client-level
alter table clients add column welcome_message text;

-- portal_access now conceptually keys off a client's project set; keep it on
-- projects for now (one code unlocks the client's whole board via the project
-- it was generated from) -- simplest change with no schema migration risk.

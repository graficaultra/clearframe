-- klar · Framer-native client portal
-- Migration 0001: core schema, RLS, portal access functions
-- Target: Supabase (Postgres 15+), EU region recommended (GDPR)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type task_status as enum ('backlog', 'in_progress', 'review', 'done');
create type comment_author as enum ('studio', 'client');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table studios (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  logo_url     text,
  accent_color text not null default '#111111',
  created_at   timestamptz not null default now()
);

create table clients (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios (id) on delete cascade,
  name          text not null,
  contact_email text, -- optional by design: store as little personal data as possible
  created_at    timestamptz not null default now()
);

create table projects (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references studios (id) on delete cascade,
  client_id         uuid not null references clients (id) on delete cascade,
  name              text not null,
  slug              text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  welcome_message   text,
  progress_override int check (progress_override between 0 and 100),
  archived_at       timestamptz,
  created_at        timestamptz not null default now()
);

create table tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects (id) on delete cascade,
  title          text not null,
  description    text,          -- client-visible wording
  internal_note  text,          -- NEVER exposed through portal functions
  status         task_status not null default 'backlog',
  client_visible boolean not null default true,
  deadline       date,
  position       double precision not null default 0,
  created_at     timestamptz not null default now()
);

create table milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title      text not null,
  due_date   date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create table links (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects (id) on delete cascade,
  title          text not null,
  url            text not null,
  client_visible boolean not null default true,
  created_at     timestamptz not null default now()
);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects (id) on delete cascade,
  author_type comment_author not null,
  author_name text not null,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create table portal_access (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  code_hash    text not null,           -- bcrypt via pgcrypto, plaintext never stored
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);

create index on clients (studio_id);
create index on projects (studio_id);
create index on tasks (project_id, status, position);
create index on milestones (project_id);
create index on links (project_id);
create index on comments (project_id, created_at);
create index on portal_access (project_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — tenant isolation enforced at the database level.
-- The Framer plugin talks to these tables directly with the anon key +
-- Supabase Auth. A studio owner can only ever touch rows of their own studio.
-- ---------------------------------------------------------------------------

alter table studios       enable row level security;
alter table clients       enable row level security;
alter table projects      enable row level security;
alter table tasks         enable row level security;
alter table milestones    enable row level security;
alter table links         enable row level security;
alter table comments      enable row level security;
alter table portal_access enable row level security;

create function is_studio_owner(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from studios where id = sid and owner_id = auth.uid());
$$;

create function owns_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    join studios s on s.id = p.studio_id
    where p.id = pid and s.owner_id = auth.uid()
  );
$$;

create policy studios_all on studios
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy clients_all on clients
  for all using (is_studio_owner(studio_id)) with check (is_studio_owner(studio_id));

create policy projects_all on projects
  for all using (is_studio_owner(studio_id)) with check (is_studio_owner(studio_id));

create policy tasks_all on tasks
  for all using (owns_project(project_id)) with check (owns_project(project_id));

create policy milestones_all on milestones
  for all using (owns_project(project_id)) with check (owns_project(project_id));

create policy links_all on links
  for all using (owns_project(project_id)) with check (owns_project(project_id));

create policy comments_all on comments
  for all using (owns_project(project_id)) with check (owns_project(project_id));

-- Studio may see metadata + revoke, but code_hash never needs to be read back.
create policy portal_access_all on portal_access
  for all using (owns_project(project_id)) with check (owns_project(project_id));

-- ---------------------------------------------------------------------------
-- Studio-side function: generate an access code.
-- Returns the plaintext code exactly once; only the hash is stored.
-- ---------------------------------------------------------------------------

create function generate_portal_code(p_project_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not owns_project(p_project_id) then
    raise exception 'not authorized';
  end if;

  -- 8 chars, unambiguous alphabet (no 0/O/1/I), ~40 bits entropy
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (get_byte(b, i) % 31) + 1, 1), '')
    into v_code
  from (select gen_random_bytes(8) b) g, generate_series(0, 7) i;

  -- One active code per project: revoke previous codes
  update portal_access set revoked_at = now()
   where project_id = p_project_id and revoked_at is null;

  insert into portal_access (project_id, code_hash)
  values (p_project_id, crypt(v_code, gen_salt('bf', 8)));

  return v_code;
end;
$$;

create function revoke_portal_access(p_project_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not owns_project(p_project_id) then
    raise exception 'not authorized';
  end if;
  update portal_access set revoked_at = now()
   where project_id = p_project_id and revoked_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal functions — called ONLY by the portal server (service_role).
-- They select exclusively client-visible fields. internal_note and
-- client_visible=false rows never leave the database.
-- ---------------------------------------------------------------------------

create function portal_verify_access(p_slug text, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_project_id uuid;
  v_access_id  uuid;
begin
  select pa.id, pa.project_id into v_access_id, v_project_id
  from portal_access pa
  join projects p on p.id = pa.project_id
  where p.slug = lower(p_slug)
    and p.archived_at is null
    and pa.revoked_at is null
    and pa.code_hash = crypt(upper(trim(p_code)), pa.code_hash)
  limit 1;

  if v_access_id is null then
    return null;
  end if;

  update portal_access set last_used_at = now() where id = v_access_id;
  return v_project_id;
end;
$$;

create function portal_get_project(p_project_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'project', jsonb_build_object(
      'name', p.name,
      'slug', p.slug,
      'welcome_message', p.welcome_message
    ),
    'studio', jsonb_build_object(
      'name', s.name,
      'logo_url', s.logo_url,
      'accent_color', s.accent_color
    ),
    'client', jsonb_build_object('name', c.name),
    'progress', coalesce(
      p.progress_override,
      (select case when count(*) = 0 then 0
              else round(100.0 * count(*) filter (where t.status = 'done') / count(*))::int end
       from tasks t where t.project_id = p.id and t.client_visible)
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description,
        'status', t.status, 'deadline', t.deadline
      ) order by t.status, t.position)
      from tasks t where t.project_id = p.id and t.client_visible
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'due_date', m.due_date, 'done', m.done
      ) order by m.due_date nulls last)
      from milestones m where m.project_id = p.id
    ), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url)
             order by l.created_at)
      from links l where l.project_id = p.id and l.client_visible
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cm.id, 'author_type', cm.author_type, 'author_name', cm.author_name,
        'body', cm.body, 'created_at', cm.created_at
      ) order by cm.created_at)
      from comments cm where cm.project_id = p.id
    ), '[]'::jsonb)
  )
  from projects p
  join studios s on s.id = p.studio_id
  join clients c on c.id = p.client_id
  where p.id = p_project_id and p.archived_at is null;
$$;

create function portal_add_comment(p_project_id uuid, p_author_name text, p_body text)
returns void
language sql security definer set search_path = public as $$
  insert into comments (project_id, author_type, author_name, body)
  values (p_project_id, 'client', left(trim(p_author_name), 80), trim(p_body));
$$;

-- Lock down: portal_* functions are for the portal server only.
revoke execute on function portal_verify_access(text, text) from public, anon, authenticated;
revoke execute on function portal_get_project(uuid) from public, anon, authenticated;
revoke execute on function portal_add_comment(uuid, text, text) from public, anon, authenticated;
grant execute on function portal_verify_access(text, text) to service_role;
grant execute on function portal_get_project(uuid) to service_role;
grant execute on function portal_add_comment(uuid, text, text) to service_role;

-- Studio functions are for authenticated plugin users.
revoke execute on function generate_portal_code(uuid) from public, anon;
revoke execute on function revoke_portal_access(uuid) from public, anon;
grant execute on function generate_portal_code(uuid) to authenticated;
grant execute on function revoke_portal_access(uuid) to authenticated;

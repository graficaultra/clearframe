-- klar · Migration 0003
-- Team members (photo via Supabase Storage) and a project lead per client.

create table team_members (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios (id) on delete cascade,
  name       text not null,
  photo_url  text,
  created_at timestamptz not null default now()
);

create index on team_members (studio_id);

alter table clients
  add column project_lead_id uuid references team_members (id) on delete set null;

alter table team_members enable row level security;

create policy team_members_all on team_members
  for all using (is_studio_owner(studio_id)) with check (is_studio_owner(studio_id));

-- ---------------------------------------------------------------------------
-- Storage: a public-read bucket for avatar photos. Studio owners can only
-- write into a path prefixed with their own studio_id, checked via RLS on
-- storage.objects using the same folder-per-studio convention Supabase docs
-- recommend (path: avatars/{studio_id}/{file}).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_studio_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and is_studio_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "avatars_studio_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and is_studio_owner(((storage.foldername(name))[1])::uuid)
  );

create policy "avatars_studio_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and is_studio_owner(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Update the portal read function to include the project lead.
-- ---------------------------------------------------------------------------

create or replace function portal_get_client(p_project_id uuid) returns jsonb
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

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const PORTAL_BASE = import.meta.env.VITE_PORTAL_BASE_URL as string;

// Boards are the kanban columns — user-editable per workspace (rename,
// reorder, recolor, add, delete). DEFAULT_BOARD_COLORS is the 8-swatch
// picker's palette; NEW_WORKSPACE_DEFAULTS seeds a fresh workspace's board
// set client-side (server also seeds via seed_default_boards RPC, so the
// two must stay in sync — see createWorkspace below).
export const DEFAULT_BOARD_COLORS = [
  "#bf9ff2", // purple
  "#16ad70", // green
  "#f78d2d", // orange
  "#ea546f", // pink
  "#32adff", // blue
  "#f2c94c", // yellow
  "#8e8e93", // grey
  "#5ac8fa", // teal
] as const;

export const NEW_WORKSPACE_DEFAULTS = [
  { name: "Backlog", color: "#bf9ff2" },
  { name: "Planning", color: "#16ad70" },
  { name: "In Progress", color: "#f78d2d" },
  { name: "Review", color: "#ea546f" },
  { name: "Completed", color: "#8e8e93" },
] as const;

export interface Board {
  id: string;
  project_id: string; // workspace id
  name: string;
  color: string; // hex
  position: number;
}

export interface Studio {
  id: string;
  name: string;
  accent_color: string;
  logo_url: string | null;
}
export interface Client {
  id: string;
  studio_id: string;
  name: string;
  contact_email: string | null;
  welcome_message: string | null;
  project_lead_id: string | null;
}
export interface TeamMember {
  id: string;
  studio_id: string;
  name: string;
  photo_url: string | null;
}
// A "workspace" is the former "project" — a container per client that owns
// its own task board (e.g. "Website", "Rebranding"). assignee_id is the one
// team member shown/switched at the top of that workspace's board.
export interface Workspace {
  id: string;
  studio_id: string;
  client_id: string;
  name: string;
  slug: string;
  position: number;
  assignee_id: string | null;
}
export interface Task {
  id: string;
  project_id: string; // workspace id
  board_id: string | null;
  title: string;
  description: string | null;   // client-visible
  internal_note: string | null; // never exposed to the portal
  deadline: string | null;
  position: number;
  created_at: string;
  updated_at: string; // drives the card's "2d" / "6h" duration label
}

// --- Studio -------------------------------------------------------------

export async function getOrCreateStudio(name?: string): Promise<Studio | null> {
  const { data } = await supabase.from("studios").select("*").limit(1).maybeSingle();
  if (data) return data as Studio;
  if (!name) return null;
  const { data: user } = await supabase.auth.getUser();
  const { data: created, error } = await supabase
    .from("studios")
    .insert({ name, owner_id: user.user!.id })
    .select()
    .single();
  if (error) throw error;
  return created as Studio;
}

// --- Team members -----------------------------------------------------------

export async function listTeamMembers(studioId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("studio_id", studioId)
    .order("name");
  if (error) throw error;
  return data as TeamMember[];
}

export async function createTeamMember(studioId: string, name: string): Promise<TeamMember> {
  const { data, error } = await supabase
    .from("team_members")
    .insert({ studio_id: studioId, name })
    .select()
    .single();
  if (error) throw error;
  return data as TeamMember;
}

export async function deleteTeamMember(id: string): Promise<void> {
  const { error } = await supabase.from("team_members").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadAvatar(
  studioId: string,
  memberId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${studioId}/${memberId}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("team_members")
    .update({ photo_url: url })
    .eq("id", memberId);
  if (updateError) throw updateError;
  return url;
}

// --- Clients --------------------------------------------------------------

export async function listClients(studioId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("studio_id", studioId)
    .order("name");
  if (error) throw error;
  return data as Client[];
}

export async function createClientRecord(
  studioId: string,
  name: string,
  contactEmail?: string
): Promise<Client> {
  const { data, error } = await supabase
    .from("clients")
    .insert({ studio_id: studioId, name, contact_email: contactEmail || null })
    .select()
    .single();
  if (error) throw error;
  return data as Client;
}

export async function updateClient(id: string, patch: Partial<Client>): Promise<void> {
  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

// --- Workspaces (formerly "projects") ---------------------------------------

export async function listWorkspacesForClient(clientId: string): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("position");
  if (error) throw error;
  return data as Workspace[];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createWorkspace(
  studioId: string,
  clientId: string,
  clientName: string,
  workspaceName: string
): Promise<Workspace> {
  const base = slugify(`${clientName}-${workspaceName}`);
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      studio_id: studioId,
      client_id: clientId,
      name: workspaceName,
      slug,
      position: Date.now(),
    })
    .select()
    .single();
  if (error) throw error;

  // Seed the five default boards (Backlog/Planning/In Progress/Review/
  // Completed) for this new workspace — server-side RPC keeps this atomic
  // with the workspace row and matches NEW_WORKSPACE_DEFAULTS above.
  const { error: seedError } = await supabase.rpc("seed_default_boards", {
    p_project_id: data.id,
  });
  if (seedError) throw seedError;

  return data as Workspace;
}

export async function updateWorkspace(id: string, patch: Partial<Workspace>): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// --- Boards (kanban columns, per workspace) --------------------------------

export async function listBoards(workspaceId: string): Promise<Board[]> {
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("project_id", workspaceId)
    .order("position");
  if (error) throw error;
  return data as Board[];
}

export async function createBoard(
  workspaceId: string,
  name: string,
  color: string
): Promise<Board> {
  const { data: existing } = await supabase
    .from("boards")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = existing ? existing.position + 1 : 0;

  const { data, error } = await supabase
    .from("boards")
    .insert({ project_id: workspaceId, name, color, position: nextPosition })
    .select()
    .single();
  if (error) throw error;
  return data as Board;
}

export async function updateBoard(id: string, patch: Partial<Board>): Promise<void> {
  const { error } = await supabase.from("boards").update(patch).eq("id", id);
  if (error) throw error;
}

// Swap two boards' positions — used by the ◄► reorder controls in Edit Board
// mode. Caller passes the two adjacent boards in their current order.
export async function swapBoardPositions(a: Board, b: Board): Promise<void> {
  await Promise.all([
    supabase.from("boards").update({ position: b.position }).eq("id", a.id),
    supabase.from("boards").update({ position: a.position }).eq("id", b.id),
  ]);
}

export async function deleteBoard(id: string): Promise<void> {
  // Tasks in a deleted board fall back to board_id = null (see migration's
  // on delete set null) rather than being destroyed — they become
  // invisible on the kanban view until reassigned, but nothing is lost.
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw error;
}

// --- Tasks (the kanban cards, per workspace) --------------------------------

export async function listTasks(workspaceId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", workspaceId)
    .order("position");
  if (error) throw error;
  return data as Task[];
}

// New tasks always land in the leftmost board, on top of whatever's already
// there (Shell's "Add task" field always targets the leftmost column,
// regardless of which column is currently visible/scrolled-to).
export async function createTask(
  workspaceId: string,
  boardId: string,
  title: string
): Promise<Task> {
  const { data: existing } = await supabase
    .from("tasks")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Position one less than the current lowest so the new card sorts first
  // ("on top") within its board.
  const position = existing ? existing.position - 1 : 0;

  const { data, error } = await supabase
    .from("tasks")
    .insert({ project_id: workspaceId, board_id: boardId, title, position })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// --- Portal access ----------------------------------------------------------
// One access code per client, generated from any of the client's workspaces —
// unlocking it shows the client's whole board (all workspaces, switchable).

export async function generateAccessCode(workspaceId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_portal_code", {
    p_project_id: workspaceId,
  });
  if (error) throw error;
  return data as string;
}

export function portalUrl(slug: string): string {
  return `${PORTAL_BASE}/p/${slug}`;
}

// --- Task duration label --------------------------------------------------
// Cards show "2d" / "6h" / "9h" — time since the task was last edited
// (updated_at), not time since creation and not time to deadline.

export function formatDuration(updatedAt: string): string {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

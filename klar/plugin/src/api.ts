import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const PORTAL_BASE = import.meta.env.VITE_PORTAL_BASE_URL as string;

export type TaskStatus = "backlog" | "planning" | "in_progress" | "review" | "completed";

export const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "planning", label: "Planning" },
  { key: "in_progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "completed", label: "Completed" },
];

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
// its own task board (e.g. "Website", "Rebranding").
export interface Workspace {
  id: string;
  studio_id: string;
  client_id: string;
  name: string;
  slug: string;
  position: number;
}
export interface Task {
  id: string;
  project_id: string; // workspace id
  title: string;
  description: string | null;   // client-visible
  internal_note: string | null; // never exposed to the portal
  status: TaskStatus;
  deadline: string | null;
  position: number;
}
export interface TaskFile {
  id: string;
  task_id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
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

export async function createTask(workspaceId: string, title: string): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ project_id: workspaceId, title, position: Date.now() })
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

// --- Task files ---------------------------------------------------------------

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

export async function listTaskFiles(taskId: string): Promise<TaskFile[]> {
  const { data, error } = await supabase
    .from("task_files")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as TaskFile[];
}

export async function uploadTaskFile(
  studioId: string,
  taskId: string,
  file: File
): Promise<TaskFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is larger than 10MB");
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${studioId}/${taskId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(path, file, { cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("task_files")
    .insert({
      task_id: taskId,
      file_name: file.name,
      storage_path: path,
      size_bytes: file.size,
      content_type: file.type || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TaskFile;
}

export async function deleteTaskFile(file: TaskFile): Promise<void> {
  await supabase.storage.from("project-files").remove([file.storage_path]);
  const { error } = await supabase.from("task_files").delete().eq("id", file.id);
  if (error) throw error;
}

export async function downloadTaskFile(file: TaskFile): Promise<string> {
  const { data, error } = await supabase.storage
    .from("project-files")
    .createSignedUrl(file.storage_path, 300);
  if (error) throw error;
  return data.signedUrl;
}

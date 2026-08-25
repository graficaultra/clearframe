import { useEffect, useMemo, useRef, useState } from "react";
import { framer } from "@framer/plugin";
import type { Session } from "@supabase/supabase-js";
import {
  COLUMNS,
  Client,
  Task,
  TaskFile,
  TaskStatus,
  TeamMember,
  Studio,
  Workspace,
  createClientRecord,
  createTask,
  createTeamMember,
  createWorkspace,
  deleteClient,
  deleteTask,
  deleteTaskFile,
  deleteTeamMember,
  deleteWorkspace,
  downloadTaskFile,
  generateAccessCode,
  getOrCreateStudio,
  listClients,
  listTaskFiles,
  listTasks,
  listTeamMembers,
  listWorkspacesForClient,
  portalUrl,
  supabase,
  updateClient,
  updateTask,
  updateWorkspace,
  uploadAvatar,
  uploadTaskFile,
} from "./api";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="pad muted">Loading…</div>;
  if (!session) return <Login />;
  return <StudioRoot />;
}

// ---------------------------------------------------------------------------

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const fn =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="login-screen">
      <div className="col gap" style={{ maxWidth: 280, width: "100%" }}>
        <div>
          <div className="title">klar</div>
          <div className="muted">Client portals, managed inside Framer.</div>
        </div>
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && <div className="err">{error}</div>}
        <div className="row gap-s">
          <button className="primary" disabled={busy} onClick={submit}>
            {mode === "login" ? "Log in" : "Create account"}
          </button>
          <button
            className="ghost"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Create account" : "Log in instead"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons

function DotsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3.5" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="12.5" cy="8" r="1.4" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 0.15s ease",
        flexShrink: 0,
      }}
    >
      <path
        d="M4 2l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Row context menu (••• button + popover)

interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

function RowMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 150) });
    setOpen(true);
  }

  return (
    <>
      <button ref={btnRef} className="overflow-btn" onClick={openMenu} aria-label="More">
        <DotsIcon />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu-popover" style={{ top: pos.top, left: pos.left }}>
            {actions.map((a) => (
              <button
                key={a.label}
                className={`menu-item ${a.danger ? "danger" : ""}`}
                onClick={() => {
                  setOpen(false);
                  a.onSelect();
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function StudioRoot() {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [needsStudio, setNeedsStudio] = useState(false);
  const [studioName, setStudioName] = useState("");

  useEffect(() => {
    getOrCreateStudio().then((s) => (s ? setStudio(s) : setNeedsStudio(true)));
  }, []);

  if (needsStudio && !studio) {
    return (
      <div className="login-screen">
        <div className="col gap" style={{ maxWidth: 280, width: "100%" }}>
          <div className="title">Name your studio</div>
          <input
            placeholder="Studio name"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
          />
          <button
            className="primary"
            disabled={!studioName.trim()}
            onClick={async () => setStudio(await getOrCreateStudio(studioName.trim()))}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (!studio) return <div className="pad muted">Loading…</div>;
  return <Shell studio={studio} />;
}

// ---------------------------------------------------------------------------
// Shell: collapsible sidebar (client/workspace tree + team/log out) and a
// main area showing the selected workspace's board.

interface Selection {
  clientId: string | null;
  workspaceId: string | null;
}

function Shell({ studio }: { studio: Studio }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [wsByClient, setWsByClient] = useState<Record<string, Workspace[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Selection>({ clientId: null, workspaceId: null });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showTeam, setShowTeam] = useState(false);
  const [share, setShare] = useState(false);

  // Creation / editing state
  const [creatingClient, setCreatingClient] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [creatingWsFor, setCreatingWsFor] = useState<string | null>(null);
  const [renamingWsId, setRenamingWsId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refreshClients = () => listClients(studio.id).then(setClients);
  const refreshTeam = () => listTeamMembers(studio.id).then(setTeam);
  const loadWorkspaces = async (clientId: string) => {
    const ws = await listWorkspacesForClient(clientId);
    setWsByClient((m) => ({ ...m, [clientId]: ws }));
    return ws;
  };

  useEffect(() => {
    refreshClients();
    refreshTeam();
  }, [studio.id]);

  function toggleExpand(clientId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
        if (!wsByClient[clientId]) loadWorkspaces(clientId);
      }
      return next;
    });
  }

  async function commitRename(wsId: string, clientId: string) {
    if (renameValue.trim()) {
      await updateWorkspace(wsId, { name: renameValue.trim() });
      await loadWorkspaces(clientId);
    }
    setRenamingWsId(null);
  }

  const selClient = clients.find((c) => c.id === sel.clientId) ?? null;
  const selWorkspace =
    (sel.clientId && wsByClient[sel.clientId]?.find((w) => w.id === sel.workspaceId)) || null;

  return (
    <div className="shell-root">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-head">
            <span className="title ellipsis">{studio.name}</span>
          </div>

          <div className="sidebar-scroll">
            <div className="sidebar-section-label">Clients</div>

            {clients.map((c) => (
              <div key={c.id}>
                <div
                  className={`side-row ${sel.clientId === c.id && !sel.workspaceId ? "active" : ""}`}
                >
                  <button className="side-row-main" onClick={() => toggleExpand(c.id)}>
                    <ChevronIcon open={expanded.has(c.id)} />
                    <span className="ellipsis">{c.name}</span>
                  </button>
                  <RowMenu
                    actions={[
                      { label: "Edit", onSelect: () => setEditingClient(c) },
                      {
                        label: "Add workspace",
                        onSelect: () => {
                          setExpanded((p) => new Set(p).add(c.id));
                          if (!wsByClient[c.id]) loadWorkspaces(c.id);
                          setCreatingWsFor(c.id);
                        },
                      },
                      {
                        label: "Delete",
                        danger: true,
                        onSelect: async () => {
                          await deleteClient(c.id);
                          if (sel.clientId === c.id) setSel({ clientId: null, workspaceId: null });
                          refreshClients();
                        },
                      },
                    ]}
                  />
                </div>

                {expanded.has(c.id) && (
                  <div className="side-children">
                    {(wsByClient[c.id] ?? []).map((w) =>
                      renamingWsId === w.id ? (
                        <input
                          key={w.id}
                          className="inline-edit side-child-row"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                          onBlur={() => commitRename(w.id, c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(w.id, c.id);
                            if (e.key === "Escape") setRenamingWsId(null);
                          }}
                        />
                      ) : (
                        <div
                          key={w.id}
                          className={`side-row side-child-row ${
                            sel.workspaceId === w.id ? "active" : ""
                          }`}
                        >
                          <button
                            className="side-row-main"
                            onClick={() => setSel({ clientId: c.id, workspaceId: w.id })}
                          >
                            <span className="ellipsis">{w.name}</span>
                          </button>
                          <RowMenu
                            actions={[
                              {
                                label: "Rename",
                                onSelect: () => {
                                  setRenamingWsId(w.id);
                                  setRenameValue(w.name);
                                },
                              },
                              {
                                label: "Delete",
                                danger: true,
                                onSelect: async () => {
                                  await deleteWorkspace(w.id);
                                  if (sel.workspaceId === w.id)
                                    setSel({ clientId: c.id, workspaceId: null });
                                  loadWorkspaces(c.id);
                                },
                              },
                            ]}
                          />
                        </div>
                      )
                    )}

                    {creatingWsFor === c.id && (
                      <NewWorkspaceInput
                        onCancel={() => setCreatingWsFor(null)}
                        onCreate={async (name) => {
                          const ws = await createWorkspace(studio.id, c.id, c.name, name);
                          setCreatingWsFor(null);
                          await loadWorkspaces(c.id);
                          setSel({ clientId: c.id, workspaceId: ws.id });
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            <button className="side-add" onClick={() => setCreatingClient(true)}>
              + New client
            </button>
          </div>

          <div className="sidebar-foot">
            <button className="side-foot-item" onClick={() => setShowTeam(true)}>
              Manage team
            </button>
            <button className="side-foot-item" onClick={() => supabase.auth.signOut()}>
              Log out
            </button>
          </div>
        </aside>
      )}

      <main className="main-area">
        <div className="bar">
          <button
            className="overflow-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <SidebarIcon />
          </button>
          {selWorkspace && selClient ? (
            <span className="title ellipsis">
              <span className="muted">{selClient.name} / </span>
              {selWorkspace.name}
            </span>
          ) : (
            <span className="title ellipsis muted">klar</span>
          )}
          {selClient && (
            <button className="ghost" onClick={() => setShare(!share)}>
              Share
            </button>
          )}
        </div>

        {share && selClient && (
          <SharePanel client={selClient} workspaces={wsByClient[selClient.id] ?? []} />
        )}

        {selWorkspace ? (
          <TaskBoard key={selWorkspace.id} workspace={selWorkspace} studioId={studio.id} />
        ) : (
          <div className="empty-state">
            <div className="muted">
              {clients.length === 0
                ? "Create your first client to get started."
                : "Select a workspace from the sidebar."}
            </div>
          </div>
        )}
      </main>

      {(creatingClient || editingClient) && (
        <ClientForm
          studio={studio}
          team={team}
          client={editingClient}
          onClose={() => {
            setCreatingClient(false);
            setEditingClient(null);
            refreshClients();
          }}
        />
      )}

      {showTeam && (
        <TeamPanel
          studio={studio}
          team={team}
          onChange={refreshTeam}
          onClose={() => setShowTeam(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function NewWorkspaceInput({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <input
      className="inline-edit side-child-row"
      placeholder="Workspace name"
      value={name}
      onChange={(e) => setName(e.target.value)}
      autoFocus
      onBlur={() => (name.trim() ? onCreate(name.trim()) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === "Enter" && name.trim()) onCreate(name.trim());
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Client create/edit — a sheet, consistent with Team and Files.

function ClientForm({
  studio,
  team,
  client,
  onClose,
}: {
  studio: Studio;
  team: TeamMember[];
  client: Client | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(client?.name ?? "");
  const [email, setEmail] = useState(client?.contact_email ?? "");
  const [leadId, setLeadId] = useState(client?.project_lead_id ?? "");

  async function save() {
    if (!name.trim()) return;
    if (client) {
      await updateClient(client.id, {
        name: name.trim(),
        contact_email: email.trim() || null,
        project_lead_id: leadId || null,
      });
    } else {
      await createClientRecord(studio.id, name.trim(), email.trim());
    }
    onClose();
  }

  return (
    <div className="sheet col gap pad">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">{client ? "Edit client" : "New client"}</span>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="label">Client name</label>
      <input
        placeholder="e.g. ACME"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <label className="label">Contact email (optional)</label>
      <input
        placeholder="contact@acme.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {client && (
        <>
          <label className="label">Project lead</label>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">— None —</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="row gap-s">
        <button className="primary" disabled={!name.trim()} onClick={save}>
          {client ? "Save" : "Create client"}
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TaskBoard({ workspace, studioId }: { workspace: Workspace; studioId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [filesFor, setFilesFor] = useState<Task | null>(null);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});

  const refresh = () =>
    listTasks(workspace.id).then(async (ts) => {
      setTasks(ts);
      const counts: Record<string, number> = {};
      await Promise.all(
        ts.map(async (t) => {
          counts[t.id] = (await listTaskFiles(t.id)).length;
        })
      );
      setFileCounts(counts);
    });
  useEffect(() => {
    refresh();
  }, [workspace.id]);

  const byStatus = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = {
      backlog: [],
      planning: [],
      in_progress: [],
      review: [],
      completed: [],
    };
    tasks.forEach((t) => m[t.status].push(t));
    return m;
  }, [tasks]);

  async function move(taskId: string, status: TaskStatus) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await updateTask(taskId, { status, position: Date.now() });
    refresh();
  }

  return (
    <div className="col fill">
      <div className="row pad-s gap-s">
        <input
          placeholder="Add a task"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newTitle.trim()) {
              await createTask(workspace.id, newTitle.trim());
              setNewTitle("");
              refresh();
            }
          }}
        />
      </div>

      <div className="board scroll">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="column"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/task");
              if (id) move(id, col.key);
            }}
          >
            <div className="col-head">
              {col.label}
              <span className="count">{byStatus[col.key].length}</span>
            </div>
            {byStatus[col.key].map((t) => (
              <div
                key={t.id}
                className={`task-card status-${col.key}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                onClick={() => setSelected(t)}
              >
                <div className="task-card-title">{t.title}</div>
                {t.deadline && <div className="muted small">{t.deadline}</div>}
                <button
                  className="files-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilesFor(t);
                  }}
                >
                  Files
                  {fileCounts[t.id] > 0 && (
                    <span className="files-badge">{fileCounts[t.id]}</span>
                  )}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <TaskDetail
          task={selected}
          onClose={() => {
            setSelected(null);
            refresh();
          }}
        />
      )}

      {filesFor && (
        <FilesPanel
          studioId={studioId}
          task={filesFor}
          onClose={() => {
            setFilesFor(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const [t, setT] = useState(task);

  async function save() {
    await updateTask(t.id, {
      title: t.title,
      description: t.description,
      internal_note: t.internal_note,
      deadline: t.deadline || null,
    });
    onClose();
  }

  return (
    <div className="sheet col gap pad">
      <input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
      <label className="label">Client-visible description</label>
      <textarea
        placeholder="What the client reads"
        value={t.description ?? ""}
        onChange={(e) => setT({ ...t, description: e.target.value })}
      />
      <label className="label">Internal note — never shown to the client</label>
      <textarea
        placeholder="Only you see this"
        value={t.internal_note ?? ""}
        onChange={(e) => setT({ ...t, internal_note: e.target.value })}
      />
      <input
        type="date"
        value={t.deadline ?? ""}
        onChange={(e) => setT({ ...t, deadline: e.target.value })}
      />
      <div className="row gap-s">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="ghost danger"
          onClick={async () => {
            await deleteTask(t.id);
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SharePanel({ client, workspaces }: { client: Client; workspaces: Workspace[] }) {
  const [code, setCode] = useState<string | null>(null);
  const anchor = workspaces[0];
  const url = anchor ? portalUrl(anchor.slug) : null;

  if (!anchor) {
    return (
      <div className="pad col gap card">
        <div className="muted small">Add at least one workspace before sharing.</div>
      </div>
    );
  }

  return (
    <div className="pad col gap card">
      <div className="label">Client portal</div>
      <div className="row gap-s">
        <input readOnly value={url!} onFocus={(e) => e.target.select()} />
        <button
          className="ghost"
          onClick={() => {
            navigator.clipboard.writeText(url!);
            framer.notify("Portal link copied");
          }}
        >
          Copy
        </button>
      </div>
      {code ? (
        <div className="row gap-s">
          <input readOnly value={code} onFocus={(e) => e.target.select()} />
          <button
            className="ghost"
            onClick={() => {
              navigator.clipboard.writeText(code);
              framer.notify("Access code copied — it won't be shown again");
            }}
          >
            Copy
          </button>
        </div>
      ) : (
        <button
          className="primary"
          onClick={async () => setCode(await generateAccessCode(anchor.id))}
        >
          Generate access code
        </button>
      )}
      <div className="muted small">
        Generating a new code revokes the previous one. The code is shown once.
      </div>
      <button className="ghost" onClick={() => window.open(url!, "_blank")}>
        Preview what the client sees
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TeamPanel({
  studio,
  team,
  onChange,
  onClose,
}: {
  studio: Studio;
  team: TeamMember[];
  onChange: () => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleFile(memberId: string, file: File | undefined) {
    if (!file) return;
    setUploadingId(memberId);
    try {
      await uploadAvatar(studio.id, memberId, file);
      onChange();
    } catch (e) {
      framer.notify("Upload failed — check the file and try again");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="sheet col gap pad">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">Team</span>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {team.length === 0 && <div className="muted small">No team members yet.</div>}

      {team.map((m) => (
        <div key={m.id} className="team-row">
          <button
            className="avatar-btn"
            onClick={() => fileInputs.current[m.id]?.click()}
            title="Upload photo"
          >
            {m.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photo_url} alt={m.name} className="avatar-img" />
            ) : (
              <span className="avatar-placeholder">{m.name.charAt(0).toUpperCase()}</span>
            )}
          </button>
          <input
            ref={(el) => (fileInputs.current[m.id] = el)}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => handleFile(m.id, e.target.files?.[0])}
          />
          <span className="team-name">
            {m.name}
            {uploadingId === m.id && " · uploading…"}
          </span>
          <button
            className="ghost danger"
            onClick={async () => {
              await deleteTeamMember(m.id);
              onChange();
            }}
          >
            Remove
          </button>
        </div>
      ))}

      <div className="row gap-s">
        <input
          placeholder="Add team member"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              await createTeamMember(studio.id, newName.trim());
              setNewName("");
              onChange();
            }
          }}
        />
        <button
          className="primary"
          disabled={!newName.trim()}
          onClick={async () => {
            await createTeamMember(studio.id, newName.trim());
            setNewName("");
            onChange();
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesPanel({
  studioId,
  task,
  onClose,
}: {
  studioId: string;
  task: Task;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = () => listTaskFiles(task.id).then(setFiles);
  useEffect(() => {
    refresh();
  }, [task.id]);

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      framer.notify("Files must be 10MB or smaller");
      return;
    }
    setBusy(true);
    try {
      await uploadTaskFile(studioId, task.id, file);
      refresh();
    } catch (e) {
      framer.notify("Upload failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet col gap pad">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">{task.title} — Files</span>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {files.length === 0 && <div className="muted small">No files yet.</div>}

      {files.map((f) => (
        <div key={f.id} className="file-row">
          <div className="file-info">
            <div className="file-name">{f.file_name}</div>
            <div className="muted small">{formatBytes(f.size_bytes)}</div>
          </div>
          <button
            className="ghost"
            onClick={async () => {
              const url = await downloadTaskFile(f);
              window.open(url, "_blank");
            }}
          >
            Download
          </button>
          <button
            className="ghost danger"
            onClick={async () => {
              await deleteTaskFile(f);
              refresh();
            }}
          >
            Delete
          </button>
        </div>
      ))}

      <input
        ref={inputRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => handleUpload(e.target.files?.[0])}
      />
      <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "Upload file (max 10MB)"}
      </button>
    </div>
  );
}

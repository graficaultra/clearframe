import { useEffect, useMemo, useRef, useState } from "react";
import { framer } from "@framer/plugin";
import type { Session } from "@supabase/supabase-js";
import {
  Board,
  Client,
  DEFAULT_BOARD_COLORS,
  Task,
  TeamMember,
  Studio,
  Workspace,
  createBoard,
  createClientRecord,
  createTask,
  createTeamMember,
  createWorkspace,
  deleteBoard,
  deleteClient,
  deleteTask,
  deleteTeamMember,
  deleteWorkspace,
  formatDuration,
  generateAccessCode,
  getOrCreateStudio,
  listBoards,
  listClients,
  listTasks,
  listTeamMembers,
  listWorkspacesForClient,
  portalUrl,
  supabase,
  swapBoardPositions,
  updateBoard,
  updateClient,
  updateTask,
  updateWorkspace,
  uploadAvatar,
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

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
      <line x1="10.8" y1="10.8" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Row context menu (••• button + popover)

interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  // Danger actions require a second confirming click before onSelect runs —
  // the popover row itself becomes the confirm step (label swaps to
  // confirmLabel) rather than opening a separate dialog, matching the
  // Figma "Delete" row's compact footprint.
  confirmLabel?: string;
}

function RowMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 150) });
    setConfirming(null);
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
            {actions.map((a) => {
              const isConfirming = a.danger && confirming === a.label;
              return (
                <button
                  key={a.label}
                  className={`menu-item ${a.danger ? "danger" : ""}`}
                  onClick={() => {
                    if (a.danger && !isConfirming) {
                      setConfirming(a.label);
                      return;
                    }
                    setOpen(false);
                    setConfirming(null);
                    a.onSelect();
                  }}
                >
                  {isConfirming ? a.confirmLabel ?? "Confirm delete?" : a.label}
                </button>
              );
            })}
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
  const [editBoard, setEditBoard] = useState(false);

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

  const [search, setSearch] = useState("");
  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      const ws = wsByClient[c.id] ?? [];
      return ws.some((w) => w.name.toLowerCase().includes(q));
    });
  }, [clients, wsByClient, search]);

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

          <label className="sidebar-search">
            <SearchIcon />
            <input
              placeholder="Search task"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="sidebar-scroll">
            <div className="sidebar-section-label-row">
              <span className="sidebar-section-label">Clients</span>
              <button className="side-add" onClick={() => setCreatingClient(true)}>
                + Add client
              </button>
            </div>

            {filteredClients.map((c) => (
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
                        confirmLabel: "Confirm delete?",
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
                                confirmLabel: "Confirm delete?",
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
          </div>

          <div className="sidebar-foot">
            <div className="sidebar-foot-label">Settings</div>
            <button className="side-foot-item" onClick={() => setShowTeam(true)}>
              Manage Team
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
          {selWorkspace && (
            <button className="ghost" onClick={() => setEditBoard((v) => !v)}>
              {editBoard ? "Save changes" : "Edit board"}
            </button>
          )}
          {selClient && (
            <ShareTrigger client={selClient} workspaces={wsByClient[selClient.id] ?? []} />
          )}
        </div>

        {selWorkspace ? (
          <TaskBoard
            key={selWorkspace.id}
            workspace={selWorkspace}
            team={team}
            editMode={editBoard}
            onManageTeam={() => setShowTeam(true)}
            onWorkspaceChange={(patch) => {
              setWsByClient((m) => {
                if (!selWorkspace) return m;
                const list = m[selWorkspace.client_id] ?? [];
                return {
                  ...m,
                  [selWorkspace.client_id]: list.map((w) =>
                    w.id === selWorkspace.id ? { ...w, ...patch } : w
                  ),
                };
              });
            }}
          />
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

function TaskBoard({
  workspace,
  team,
  editMode,
  onWorkspaceChange,
  onManageTeam,
}: {
  workspace: Workspace;
  team: TeamMember[];
  editMode: boolean;
  onWorkspaceChange: (patch: Partial<Workspace>) => void;
  onManageTeam: () => void;
}) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const [addingBoard, setAddingBoard] = useState(false);

  const refreshBoards = () => listBoards(workspace.id).then(setBoards);
  const refreshTasks = () => listTasks(workspace.id).then(setTasks);
  useEffect(() => {
    refreshBoards();
    refreshTasks();
  }, [workspace.id]);

  const byBoard = useMemo(() => {
    const m: Record<string, Task[]> = {};
    boards.forEach((b) => (m[b.id] = []));
    tasks.forEach((t) => {
      if (t.board_id && m[t.board_id]) m[t.board_id].push(t);
    });
    return m;
  }, [boards, tasks]);

  const leftmostBoard = boards[0];

  async function move(taskId: string, boardId: string) {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, board_id: boardId } : t)));
    await updateTask(taskId, { board_id: boardId });
    refreshTasks();
  }

  async function addTask() {
    if (!newTitle.trim() || !leftmostBoard) return;
    await createTask(workspace.id, leftmostBoard.id, newTitle.trim());
    setNewTitle("");
    refreshTasks();
  }

  return (
    <div className="col fill">
      <div className="board-toolbar">
        {editMode ? (
          <button className="pill primary" disabled={addingBoard} onClick={() => setAddingBoard(true)}>
            + Add board
          </button>
        ) : (
          <input
            className="add-task-field"
            placeholder="Add task"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
        )}
        <AssigneeSwitcher
          workspace={workspace}
          team={team}
          onManageTeam={onManageTeam}
          onChange={(id) => {
            updateWorkspace(workspace.id, { assignee_id: id });
            onWorkspaceChange({ assignee_id: id });
          }}
        />
      </div>

      <div className="board scroll">
        {boards.map((b, i) => (
          <div
            key={b.id}
            className="column"
            onDragOver={(e) => editMode || e.preventDefault()}
            onDrop={(e) => {
              if (editMode) return;
              const id = e.dataTransfer.getData("text/task");
              if (id) move(id, b.id);
            }}
          >
            <div className="col-head">
              <span className={editMode ? "col-title editing" : "col-title"}>{b.name}</span>
              {!editMode && <span className="count">{byBoard[b.id]?.length ?? 0}</span>}
              {editMode && (
                <div className="col-head-actions">
                  <button
                    className="reorder-btn"
                    disabled={i === 0}
                    onClick={async () => {
                      await swapBoardPositions(boards[i - 1], b);
                      refreshBoards();
                    }}
                    aria-label="Move left"
                  >
                    ◄
                  </button>
                  <button
                    className="reorder-btn"
                    disabled={i === boards.length - 1}
                    onClick={async () => {
                      await swapBoardPositions(b, boards[i + 1]);
                      refreshBoards();
                    }}
                    aria-label="Move right"
                  >
                    ►
                  </button>
                  <RowMenu
                    actions={[
                      {
                        label: "Delete",
                        danger: true,
                        confirmLabel: "Confirm delete?",
                        onSelect: async () => {
                          await deleteBoard(b.id);
                          refreshBoards();
                          refreshTasks();
                        },
                      },
                    ]}
                  />
                </div>
              )}
            </div>

            {editMode && (
              <div className="swatch-row">
                {DEFAULT_BOARD_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${b.color === c ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={async () => {
                      await updateBoard(b.id, { color: c });
                      refreshBoards();
                    }}
                    aria-label={`Set color ${c}`}
                  />
                ))}
              </div>
            )}

            {byBoard[b.id]?.map((t) => (
              <div
                key={t.id}
                className="task-card"
                style={{
                  background: editMode ? `${b.color}33` : b.color,
                  opacity: editMode ? 0.7 : 1,
                }}
                draggable={!editMode}
                onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                onClick={() => !editMode && setSelected(t)}
              >
                <div className="task-card-title">{t.title}</div>
                {t.description && <div className="task-card-note">{t.description}</div>}
                <div className="task-card-duration">
                  <ClockIcon />
                  {formatDuration(t.updated_at)}
                </div>
              </div>
            ))}

            {editMode && addingBoard && i === boards.length - 1 && (
              <NewBoardInline
                onCancel={() => setAddingBoard(false)}
                onCreate={async (name) => {
                  await createBoard(workspace.id, name, DEFAULT_BOARD_COLORS[0]);
                  setAddingBoard(false);
                  refreshBoards();
                }}
              />
            )}
          </div>
        ))}
      </div>

      {selected && (
        <TaskDetail
          task={selected}
          onClose={() => {
            setSelected(null);
            refreshTasks();
          }}
        />
      )}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 4.5V8l2.8 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function NewBoardInline({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <input
      className="inline-edit new-board-input"
      placeholder="Board name"
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
// Assignee — one team member per workspace, shown top-right of the board
// with a photo + name, switchable via an anchored popover (same visual
// language as RowMenu, listing all team members + a "Manage Team" shortcut).

function AssigneeSwitcher({
  workspace,
  team,
  onChange,
  onManageTeam,
}: {
  workspace: Workspace;
  team: TeamMember[];
  onChange: (memberId: string | null) => void;
  onManageTeam: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const current = team.find((m) => m.id === workspace.assignee_id) ?? null;

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos(popoverPosition(r, 190));
    setOpen(true);
  }

  return (
    <div className="assignee-switcher">
      <button ref={btnRef} className="assignee-btn" onClick={openMenu}>
        <span className="avatar-btn assignee-avatar">
          {current?.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.photo_url} alt={current.name} className="avatar-img" />
          ) : (
            <span className="avatar-placeholder">
              {current ? current.name.charAt(0).toUpperCase() : "?"}
            </span>
          )}
        </span>
        <span className="assignee-info">
          <span className="assignee-label">Assigned to</span>
          <span className="assignee-name">{current ? current.name : "Unassigned"}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu-popover assignee-popover" style={pos}>
            <div className="menu-title">Select team member</div>
            {team.length === 0 && <div className="muted small menu-empty">No team members yet.</div>}
            {team.map((m) => (
              <button
                key={m.id}
                className="menu-item"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {m.name}
              </button>
            ))}
            <div className="menu-divider" />
            <button
              className="menu-item accent"
              onClick={() => {
                setOpen(false);
                onManageTeam();
              }}
            >
              Manage Team ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="9" height="6" viewBox="0 0 10 6" fill="none">
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

// Popovers anchor on their trigger and flip left/right depending on
// available space, so a modal opened near the right edge (like Share,
// which sits at the far right of the nav bar) always stays fully visible.
function popoverPosition(
  triggerRect: DOMRect,
  panelWidth: number
): { top: number; left?: number; right?: number } {
  const spaceRight = window.innerWidth - triggerRect.right;
  const top = triggerRect.bottom + 6;
  if (spaceRight >= panelWidth + 12) {
    return { top, right: Math.max(8, window.innerWidth - triggerRect.right) };
  }
  return { top, left: Math.max(8, triggerRect.left - panelWidth + triggerRect.width) };
}

function ShareTrigger({ client, workspaces }: { client: Client; workspaces: Workspace[] }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  const anchor = workspaces[0];
  const url = anchor ? portalUrl(anchor.slug) : null;

  function openPanel() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos(popoverPosition(r, 395));
    setCode(null);
    setOpen(true);
  }

  return (
    <>
      <button ref={btnRef} className="primary pill" onClick={openPanel}>
        Share
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="share-popover" style={pos}>
            {!anchor ? (
              <div className="muted small">Add at least one workspace before sharing.</div>
            ) : (
              <>
                <div className="share-label">Client portal</div>
                <div className="share-field">
                  <input readOnly value={url!} onFocus={(e) => e.target.select()} />
                  <button
                    className="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(url!);
                      framer.notify("Portal link copied");
                    }}
                  >
                    <CopyIcon />
                  </button>
                </div>

                <div className="share-label">Access code</div>
                {code ? (
                  <div className="share-field">
                    <input readOnly value={code} onFocus={(e) => e.target.select()} />
                    <button
                      className="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(code);
                        framer.notify("Access code copied — it won't be shown again");
                      }}
                    >
                      <CopyIcon />
                    </button>
                  </div>
                ) : (
                  <div className="share-field">
                    <input readOnly value="" placeholder="" />
                    <button
                      className="primary pill share-generate"
                      onClick={async () => setCode(await generateAccessCode(anchor.id))}
                    >
                      Generate
                    </button>
                  </div>
                )}
                <div className="muted small">Generating a new code revokes the previous one.</div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3 10V3.5A1.5 1.5 0 0 1 4.5 2H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
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

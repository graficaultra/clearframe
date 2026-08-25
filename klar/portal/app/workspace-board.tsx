"use client";

import { useEffect, useState } from "react";

type Workspace = { id: string; name: string };
type Board = { id: string; name: string; color: string };
type Task = {
  id: string;
  title: string;
  board_id: string | null;
  description: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
};

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : null;
}

// Duration reflects last edit (updated_at), not creation — matches the
// plugin side's card label exactly, so a client and the studio see the
// same "2d" / "6h" figure for the same task.
function fmtRelative(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function WorkspaceBoard({
  slug,
  workspaces,
  initialWorkspaceId,
}: {
  slug: string;
  workspaces: Workspace[];
  initialWorkspaceId: string;
}) {
  const [currentId, setCurrentId] = useState(initialWorkspaceId);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/workspace-tasks?slug=${encodeURIComponent(slug)}&workspace_id=${currentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setBoards(d.boards ?? []);
          setTasks(d.tasks ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, currentId]);

  return (
    <>
      {workspaces.length > 1 && (
        <div className="workspace-switcher">
          <select value={currentId} onChange={(e) => setCurrentId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="client-board">
        {(boards ?? []).map((board) => (
          <div className="client-column" key={board.id}>
            <div className="client-col-head">
              {board.name}
              <span className="count">
                {loading ? "" : tasks?.filter((t) => t.board_id === board.id).length}
              </span>
            </div>
            {!loading &&
              tasks
                ?.filter((t) => t.board_id === board.id)
                .map((t) => (
                  <div
                    className="client-card"
                    key={t.id}
                    style={{ background: board.color }}
                  >
                    <div className="client-card-title">{t.title}</div>
                    {t.description && <div className="client-card-desc">{t.description}</div>}
                    {t.deadline && <div className="client-card-date">Due {fmt(t.deadline)}</div>}
                    <div className="client-card-footer">
                      <span className="client-card-time">
                        <ClockIcon /> {fmtRelative(t.updated_at)}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        ))}
      </div>

      {!loading && tasks?.length === 0 && (
        <section>
          <p className="welcome">No tasks yet in this workspace.</p>
        </section>
      )}
    </>
  );
}

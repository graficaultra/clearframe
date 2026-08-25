"use client";

import { useEffect, useState } from "react";
import { GetFilesButton } from "@/app/get-files-button";

type Workspace = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  status: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
  files: { file_name: string; download_url: string | null }[];
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  planning: "Planning",
  in_progress: "In progress",
  review: "Ready for review",
  completed: "Completed",
};
const STATUS_ORDER = ["backlog", "planning", "in_progress", "review", "completed"];

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
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/workspace-tasks?slug=${encodeURIComponent(slug)}&workspace_id=${currentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
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
        {STATUS_ORDER.map((status) => (
          <div className="client-column" key={status}>
            <div className="client-col-head">
              {STATUS_LABEL[status]}
              <span className="count">
                {loading ? "" : tasks?.filter((t) => t.status === status).length}
              </span>
            </div>
            {!loading &&
              tasks
                ?.filter((t) => t.status === status)
                .map((t) => (
                  <div className={`client-card status-${status}`} key={t.id}>
                    <div className="client-card-title">{t.title}</div>
                    {t.description && <div className="client-card-desc">{t.description}</div>}
                    {t.deadline && <div className="client-card-date">Due {fmt(t.deadline)}</div>}
                    <div className="client-card-footer">
                      <span className="client-card-time">
                        <ClockIcon /> {fmtRelative(t.created_at)}
                      </span>
                      {t.files?.length > 0 && <GetFilesButton files={t.files} />}
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

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSourceFiles } from "../lib/graph/query";
import { deleteSource } from "../lib/graph/ingest";
import type { SourceFile, SourceKind } from "../lib/database.types";
import { supabase } from "../lib/supabase";

const KIND_LABEL: Record<SourceKind, string> = {
  failed_exam: "exam",
  transcript: "transcript",
  practice_work: "practice",
  essay: "essay",
  syllabus: "syllabus",
  note: "note",
  voice: "voice",
  other: "other",
};

interface SourceListProps {
  /** Re-fetch trigger — bump this number to force a reload. */
  reloadKey?: number;
}

/**
 * The "what ione has read" panel. Shows uploaded source files with
 * status, kind, size, and a delete button. Subscribes to the `events`
 * table so future agent activity (e.g. "TranscriptReader extracted
 * 14 claims") reflects in real time.
 */
export function SourceList({ reloadKey = 0 }: SourceListProps) {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await listSourceFiles();
    setFiles(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, reloadKey]);

  // Light realtime: re-fetch when an `events` row lands for this user.
  // The events table already enforces ownership via RLS, so the channel
  // will only ever surface this student's own activity.
  useEffect(() => {
    const channel = supabase
      .channel("source-files-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "source_files" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const onDelete = useCallback(async (file: SourceFile) => {
    const ok = window.confirm(
      `delete "${file.title ?? file.filename}"? this also removes any claims grounded in it.`,
    );
    if (!ok) return;
    const success = await deleteSource(file);
    if (success) {
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    }
  }, []);

  return (
    <div className="border border-ink-line bg-ink-raise/40 p-6 sm:p-8">
      <div className="flex items-baseline justify-between mb-5">
        <div className="section-label">© ione — sources read</div>
        <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-faint">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>

      {loading && (
        <p className="font-sub text-[11px] tracking-wide text-paper-mute">
          flipping through your shelf…
        </p>
      )}

      {!loading && files.length === 0 && (
        <div className="py-6 text-paper-mute">
          <p className="font-sub text-[12px] leading-relaxed mb-3">
            nothing yet — your shelf is empty.
          </p>
          <p
            className="text-red-pencil text-xl"
            style={{ fontFamily: "var(--font-hand)" }}
          >
            ← upload one to start
          </p>
        </div>
      )}

      {!loading && files.length > 0 && (
        <ul className="divide-y divide-ink-line -mx-1">
          {files.map((file) => (
            <li
              key={file.id}
              className="px-1 py-3 flex items-start justify-between gap-4 group"
            >
              <Link
                to={`/dashboard/sources/${file.id}`}
                className="min-w-0 flex-1 group/link"
                aria-label={`open ${file.filename}`}
              >
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-red-pencil">
                    {KIND_LABEL[file.kind]}
                  </span>
                  <StatusDot status={file.status} />
                </div>
                <div
                  className="text-paper text-[15px] truncate group-hover/link:text-red-pencil transition-colors"
                  style={{ fontFamily: "var(--font-display)" }}
                  title={file.filename}
                >
                  {file.title ?? file.filename}
                </div>
                <div className="font-sub text-[10px] tracking-wide text-paper-mute mt-0.5">
                  {formatSize(file.size_bytes)} ·{" "}
                  {timeAgo(file.uploaded_at)}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => onDelete(file)}
                className="font-sub text-[10px] tracking-[0.18em] uppercase text-paper-mute hover:text-red-pencil transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`delete ${file.filename}`}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: SourceFile["status"] }) {
  const map: Record<
    SourceFile["status"],
    { color: string; label: string }
  > = {
    pending: { color: "bg-paper-mute", label: "queued" },
    parsed: { color: "bg-brass", label: "parsed" },
    extracted: { color: "bg-moss", label: "read" },
    failed: { color: "bg-red-pencil", label: "failed" },
  };
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 font-sub text-[9px] tracking-[0.18em] uppercase text-paper-mute">
      <span className={`block w-1.5 h-1.5 rounded-full ${m.color}`} />
      {m.label}
    </span>
  );
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * SourceDetail — chunks viewer + claims-from-this-source list.
 *
 * Phase 4 / G6.
 *
 * Anchors the trust story: every claim ione holds is traceable to a
 * specific chunk of a specific upload. This page is where the user
 * verifies that. Layout:
 *
 *   header        kind, filename, title, status
 *   left column   chunks list (clickable; selected highlights the
 *                 corresponding claims)
 *   right column  claims extracted from this source, grouped by
 *                 chunk; click a claim to scroll to its chunk
 *
 * Reuses extractor/predicate vocabulary from /lib/graph.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Chunk, Claim, SourceFile } from "../../lib/database.types";

export function SourceDetail() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<SourceFile | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const chunkRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [{ data: src, error: sErr }, { data: cks, error: cErr }, { data: cls, error: clErr }] =
        await Promise.all([
          supabase
            .from("source_files")
            .select("*")
            .eq("id", id)
            .single(),
          supabase
            .from("chunks")
            .select("*")
            .eq("source_file_id", id)
            .order("position", { ascending: true, nullsFirst: false })
            .order("offset_start", { ascending: true, nullsFirst: false }),
          supabase
            .from("claims")
            .select("*")
            .eq("source_file_id", id)
            .order("created_at", { ascending: true }),
        ]);
      if (cancelled) return;
      if (sErr || !src) {
        setErr(sErr?.message ?? "source not found");
        setLoading(false);
        return;
      }
      if (cErr) console.error("[SourceDetail] chunks error", cErr);
      if (clErr) console.error("[SourceDetail] claims error", clErr);
      setSource(src as SourceFile);
      setChunks((cks ?? []) as Chunk[]);
      setClaims((cls ?? []) as Claim[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const claimsByChunk = useMemo(() => {
    const m = new Map<string, Claim[]>();
    for (const c of claims) {
      const k = c.source_chunk_id ?? "__nochunk__";
      let bucket = m.get(k);
      if (!bucket) {
        bucket = [];
        m.set(k, bucket);
      }
      bucket.push(c);
    }
    return m;
  }, [claims]);

  function scrollToChunk(chunkId: string) {
    setActiveChunkId(chunkId);
    const el = chunkRefs.current[chunkId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (loading) {
    return (
      <div className="text-paper-mute font-mono text-xs animate-pulse">
        loading source…
      </div>
    );
  }
  if (err || !source) {
    return (
      <div className="border border-ink-line bg-ink-deep px-6 py-10 text-center">
        <p className="text-red-pencil font-mono text-sm">{err ?? "not found"}</p>
        <Link
          to="/dashboard"
          className="inline-block mt-4 font-mono text-[11px] tracking-[0.18em] uppercase pencil-link"
        >
          ← back to desk
        </Link>
      </div>
    );
  }

  const orphanClaims = claimsByChunk.get("__nochunk__") ?? [];

  return (
    <section>
      <Link
        to="/dashboard"
        className="inline-block mb-5 font-mono text-[11px] tracking-[0.18em] uppercase pencil-link"
      >
        ← back to desk
      </Link>

      <header className="mb-8">
        <div className="section-label">© ione — source · {source.kind}</div>
        <h1
          className="h-display text-[1.7rem] sm:text-[2rem] leading-tight mt-1"
          style={{ fontStyle: "italic" }}
        >
          {source.title ?? source.filename}
        </h1>
        <div className="mt-3 flex items-center gap-x-4 gap-y-1 flex-wrap font-mono text-[10px] tracking-[0.18em] uppercase text-paper-mute">
          <span>{source.filename}</span>
          <span>·</span>
          <span>status: {source.status}</span>
          <span>·</span>
          <span>{chunks.length} chunks</span>
          <span>·</span>
          <span>{claims.length} claims</span>
          <span>·</span>
          <span>uploaded {formatRelative(new Date(source.uploaded_at))}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-8">
        <div className="lg:col-span-7">
          <div className="section-label mb-2">chunks</div>
          {chunks.length === 0 ? (
            <p className="text-paper-mute font-mono text-xs">
              no chunks yet — extraction may still be running.
            </p>
          ) : (
            <ol className="border border-ink-line bg-ink-deep ruled-paper divide-y divide-ink-line max-h-[70vh] overflow-y-auto">
              {chunks.map((c) => {
                const cClaims = claimsByChunk.get(c.id) ?? [];
                const active = activeChunkId === c.id;
                return (
                  <li
                    key={c.id}
                    ref={(el) => {
                      chunkRefs.current[c.id] = el;
                    }}
                    className={[
                      "px-5 py-4 cursor-pointer transition-colors",
                      active ? "bg-red-pencil/10" : "hover:bg-ink-line/30",
                    ].join(" ")}
                    onClick={() =>
                      setActiveChunkId(active ? null : c.id)
                    }
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
                      <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-faint">
                        chunk {c.position ?? "?"}
                      </span>
                      <span className="font-mono text-[10px] tracking-wide text-paper-faint">
                        {cClaims.length === 0
                          ? "no claims"
                          : `${cClaims.length} claim${cClaims.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <p className="text-paper text-sm leading-relaxed whitespace-pre-wrap">
                      {truncate(c.text, 600)}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <aside className="lg:col-span-5">
          <div className="section-label mb-2">claims</div>
          {claims.length === 0 ? (
            <p className="text-paper-mute font-mono text-xs">
              extraction hasn't produced any claims yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {claims.map((c) => (
                <ClaimItem
                  key={c.id}
                  claim={c}
                  onJump={(chunkId) => scrollToChunk(chunkId)}
                />
              ))}
              {orphanClaims.length > 0 && (
                <p className="font-mono text-[10px] tracking-wide text-paper-faint mt-3">
                  {orphanClaims.length} unrooted claim
                  {orphanClaims.length === 1 ? "" : "s"} (no chunk citation)
                </p>
              )}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}

function ClaimItem({
  claim,
  onJump,
}: {
  claim: Claim;
  onJump: (chunkId: string) => void;
}) {
  const isHigh = claim.sensitivity === "high";
  const isMed = claim.sensitivity === "medium";
  const status = claim.status;
  return (
    <li className="border border-ink-line bg-ink-deep px-4 py-3">
      <div className="flex items-baseline justify-between gap-2 mb-1.5 flex-wrap">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-red-pencil">
          {claim.predicate}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-wide text-paper-faint">
            {(claim.confidence * 100).toFixed(0)}%
          </span>
          {(isHigh || isMed) && (
            <span
              className={[
                "font-mono text-[9px] tracking-[0.18em] uppercase px-1.5 py-px border",
                isHigh
                  ? "text-red-pencil border-red-pencil/60"
                  : "text-brass border-brass/60",
              ].join(" ")}
            >
              {isHigh ? "high" : "med"}
            </span>
          )}
          <span
            className={[
              "font-mono text-[9px] tracking-wide",
              status === "confirmed"
                ? "text-moss"
                : status === "rejected"
                  ? "text-paper-faint line-through"
                  : "text-paper-mute",
            ].join(" ")}
          >
            {status}
          </span>
        </div>
      </div>
      <p
        className="text-paper text-[14px] leading-snug mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {renderObject(claim.object)}
      </p>
      {claim.reasoning && (
        <p
          className="text-paper-dim text-xs leading-snug mb-2"
          style={{ fontStyle: "italic" }}
        >
          "{truncate(claim.reasoning, 180)}"
        </p>
      )}
      <div className="flex items-center gap-3 font-mono text-[10px] tracking-wide text-paper-faint">
        <span>{claim.extracted_by}</span>
        {claim.source_chunk_id && (
          <button
            type="button"
            onClick={() => onJump(claim.source_chunk_id!)}
            className="pencil-link"
          >
            → cited chunk
          </button>
        )}
      </div>
    </li>
  );
}

function renderObject(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

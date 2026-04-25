import { useCallback, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { ingestSource } from "../lib/graph/ingest";
import type { SourceKind } from "../lib/database.types";

interface SourceUploadProps {
  /** Called after a successful upload so the parent can refresh its list. */
  onUploaded?: () => void;
  /** Override the default kind picker copy (used in onboarding). */
  heading?: string;
  /** Hide the surrounding card chrome (for use inside an existing card). */
  bare?: boolean;
}

const KIND_OPTIONS: { value: SourceKind; label: string; help: string }[] = [
  {
    value: "failed_exam",
    label: "failed exam",
    help: "the test you bombed — picture or scan",
  },
  {
    value: "transcript",
    label: "transcript",
    help: "report card / grade history",
  },
  {
    value: "practice_work",
    label: "practice work",
    help: "homework, scratch paper, notebook page",
  },
  {
    value: "essay",
    label: "essay",
    help: "writing sample, especially with feedback",
  },
  { value: "syllabus", label: "syllabus", help: "your class's syllabus" },
  {
    value: "note",
    label: "freeform note",
    help: "anything you want ione to know — paste as .txt",
  },
];

/**
 * The dropzone + kind picker. Visually styled like a margin-of-paper
 * "drop here" annotation rather than a generic file uploader.
 */
export function SourceUpload({
  onUploaded,
  heading = "drop a document",
  bare = false,
}: SourceUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<SourceKind>("failed_exam");
  const [title, setTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; filename: string }
    | { kind: "err"; msg: string }
  >({ kind: "idle" });

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setStatus({ kind: "idle" });
      const res = await ingestSource({ file, kind, title: title.trim() });
      setBusy(false);
      if (res.ok) {
        setStatus({ kind: "ok", filename: res.sourceFile.filename });
        setTitle("");
        onUploaded?.();
      } else {
        setStatus({ kind: "err", msg: res.error });
      }
    },
    [kind, title, onUploaded],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void upload(file);
      e.target.value = "";
    },
    [upload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void upload(file);
    },
    [upload],
  );

  const wrapperClass = bare
    ? ""
    : "border border-ink-line bg-ink-raise/40 p-6 sm:p-8";

  return (
    <div className={wrapperClass}>
      {!bare && (
        <div className="flex items-baseline justify-between mb-5">
          <div className="section-label">+ new source</div>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-faint">
            stays in your account
          </span>
        </div>
      )}

      <h3
        className="h-editorial text-[1.4rem] sm:text-[1.6rem] mb-4"
        style={{ fontStyle: "italic" }}
      >
        {heading}
      </h3>

      {/* ── kind picker (chips) ─────────────────────────────────────── */}
      <div
        role="radiogroup"
        aria-label="document type"
        className="flex flex-wrap gap-2 mb-5"
      >
        {KIND_OPTIONS.map((opt) => {
          const active = opt.value === kind;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setKind(opt.value)}
              title={opt.help}
              className={`px-3 py-1.5 text-[11px] font-mono tracking-[0.14em] uppercase border transition-colors ${
                active
                  ? "border-red-pencil text-paper bg-red-pencil/15"
                  : "border-ink-line text-paper-mute hover:text-paper hover:border-paper-faint"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[10px] tracking-wide text-paper-mute -mt-2 mb-5">
        {KIND_OPTIONS.find((o) => o.value === kind)?.help}
      </p>

      {/* ── optional title ──────────────────────────────────────────── */}
      <div className="mb-5">
        <label
          htmlFor={`${inputId}-title`}
          className="block font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute mb-2"
        >
          label (optional)
        </label>
        <input
          id={`${inputId}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Algebra 2 — Chapter 5 test"'
          className="w-full bg-transparent border-0 border-b border-paper-faint focus:border-red-pencil focus:outline-none px-0 py-2 text-paper placeholder:text-paper-faint font-mono text-sm transition-colors"
        />
      </div>

      {/* ── dropzone ────────────────────────────────────────────────── */}
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative block cursor-pointer border border-dashed transition-colors px-6 py-10 text-center ${
          dragOver
            ? "border-red-pencil bg-red-pencil/5"
            : "border-paper-faint hover:border-paper-mute"
        } ${busy ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          onChange={onPick}
          accept="image/*,application/pdf,text/plain,.md,.csv,.docx"
        />
        <div
          className="h-display text-[1.6rem] sm:text-[1.9rem] mb-2"
          style={{ fontStyle: "italic" }}
        >
          {busy ? "uploading…" : "drop file here"}
        </div>
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          or click to browse · pdf · image · txt · ≤ 25 mb
        </div>

        {/* hand-drawn arrow in the corner */}
        <span
          className="absolute -top-3 -right-2 text-red-pencil text-2xl rotate-12 pointer-events-none"
          style={{ fontFamily: "var(--font-hand)" }}
        >
          ↘ here
        </span>
      </label>

      {/* ── status ──────────────────────────────────────────────────── */}
      {status.kind === "ok" && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 font-mono text-[11px] tracking-wide text-moss"
        >
          ✓ uploaded {status.filename}. ione will read it next.
        </motion.p>
      )}
      {status.kind === "err" && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 font-mono text-[11px] tracking-wide text-red-pencil"
        >
          × {status.msg}
        </motion.p>
      )}
    </div>
  );
}

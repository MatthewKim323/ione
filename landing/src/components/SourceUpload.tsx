import { useCallback, useId, useState } from "react";
import { motion } from "motion/react";
import { ingestSource } from "../lib/graph/ingest";
import { inferSourceKind } from "../lib/graph/inferSourceKind";

interface SourceUploadProps {
  /** Called after each successful upload so the parent can refresh its list. */
  onUploaded?: () => void;
  /** Override the default heading. */
  heading?: string;
  /** Hide the surrounding card chrome (for use inside an existing card). */
  bare?: boolean;
}

type Line =
  | { kind: "ok"; filename: string; inferred: string }
  | { kind: "err"; filename: string; msg: string };

/**
 * Bulk dropzone: many files, each gets an inferred `source_kind` per file.
 * No per-batch type picker — one surface, one mental model.
 */
export function SourceUpload({
  onUploaded,
  heading = "drop a document",
  bare = false,
}: SourceUploadProps) {
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);

  const uploadMany = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.size > 0);
      if (list.length === 0) return;

      setBusy(true);
      setLines([]);
      const baseTitle = title.trim();
      let anyOk = false;

      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        const kind = inferSourceKind(file);
        const perTitle =
          list.length === 1
            ? baseTitle || undefined
            : baseTitle
              ? `${baseTitle} · ${file.name}`
              : undefined;

        const res = await ingestSource({
          file,
          kind,
          title: perTitle,
        });

        if (res.ok) {
          anyOk = true;
          setLines((prev) => [
            ...prev,
            {
              kind: "ok",
              filename: res.sourceFile.filename,
              inferred: kind.replace(/_/g, " "),
            },
          ]);
          onUploaded?.();
        } else {
          setLines((prev) => [
            ...prev,
            { kind: "err", filename: file.name, msg: res.error },
          ]);
        }
      }

      if (anyOk) setTitle("");
      setBusy(false);
    },
    [title, onUploaded],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fl = e.target.files;
      if (fl && fl.length > 0) void uploadMany(fl);
      e.target.value = "";
    },
    [uploadMany],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragOver(false);
      const fl = e.dataTransfer.files;
      if (fl && fl.length > 0) void uploadMany(fl);
    },
    [uploadMany],
  );

  const wrapperClass = bare ? "" : "notebook-card p-6 sm:p-8";

  return (
    <div className={wrapperClass}>
      {!bare && (
        <div className="flex items-baseline justify-between mb-5">
          <div className="section-label-light">+ ingest</div>
          <span className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
            stays in your account
          </span>
        </div>
      )}

      <h3
        className="h-display-light text-[1.4rem] sm:text-[1.6rem] mb-4 leading-tight"
        style={{ fontStyle: "italic" }}
      >
        {heading}
      </h3>

      <p className="font-sub text-[10px] tracking-wide text-paper-mute mb-5 max-w-[56ch]">
        types are inferred per file (name + MIME). drop a whole folder of mixed
        scans if you want — each file is indexed on its own.
      </p>

      <div className="mb-5">
        <label
          htmlFor={`${inputId}-title`}
          className="block font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute mb-2"
        >
          batch label (optional)
        </label>
        <input
          id={`${inputId}-title`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "junior fall — everything"'
          className="w-full bg-transparent border-0 border-b border-line focus:border-red-pencil focus:outline-none px-0 py-2 text-ink-deep placeholder:text-paper-mute/70 font-sub text-sm transition-colors"
        />
      </div>

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
            : "border-paper-faint hover:border-ink-deep hover:bg-paper-warm/40"
        } ${busy ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          onChange={onPick}
          accept="image/*,application/pdf,text/plain,.md,.csv,.docx,audio/*"
        />
        <div
          className="h-display-light text-[1.6rem] sm:text-[1.9rem] mb-2"
          style={{ fontStyle: "italic" }}
        >
          {busy ? "indexing…" : "drop files here"}
        </div>
        <div className="font-sub text-[10px] tracking-[0.22em] uppercase text-paper-mute">
          or click to browse · pdf · image · txt · audio · many at once · ≤ 25
          mb each
        </div>

        <span
          className="absolute -top-3 -right-2 text-red-pencil text-2xl rotate-12 pointer-events-none"
          style={{ fontFamily: "var(--font-hand)" }}
        >
          ↘ here
        </span>
      </label>

      {lines.length > 0 && (
        <ul className="mt-5 space-y-2 text-left max-h-48 overflow-y-auto pr-1">
          {lines.map((row, i) =>
            row.kind === "ok" ? (
              <motion.li
                key={`${row.filename}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-sub text-[11px] tracking-wide text-moss"
              >
                ✓ {row.filename}{" "}
                <span className="text-paper-mute">({row.inferred})</span>
              </motion.li>
            ) : (
              <motion.li
                key={`${row.filename}-err-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-sub text-[11px] tracking-wide text-red-pencil"
              >
                × {row.filename}: {row.msg}
              </motion.li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

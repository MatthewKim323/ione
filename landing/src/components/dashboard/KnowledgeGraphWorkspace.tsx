import { useCallback, useState } from "react";
import { SourceUpload } from "../SourceUpload";
import { SourceList } from "../SourceList";
import { MemoryFeed } from "../MemoryFeed";

/**
 * Single desk surface: bulk ingest → list → live memory ticker.
 * Pairs with MemoryInspector + ProposalReview on /dashboard/graph.
 */
export function KnowledgeGraphWorkspace() {
  const [reloadKey, setReloadKey] = useState(0);
  const onUploaded = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <section id="kg-ingest" className="mb-20 scroll-mt-28">
      <div className="section-label-light mb-4">
        © ione — 000 / knowledge graph
      </div>
      <h2
        className="h-display-light text-[2.25rem] sm:text-[3rem] leading-[0.95] mb-4"
      >
        drop <em className="h-forest">everything.</em>
      </h2>
      <p className="text-paper-faint text-base leading-relaxed max-w-[62ch] mb-3">
        one inbox for transcripts, scans, PDFs, photos of scratch work, and
        notes. each file is stored, chunked, and tagged with an inferred type
        so the right extractors run. agents and the tutor query the same
        surface:{" "}
        <code className="font-mono text-[11px] text-paper-mute bg-paper-warm/80 px-1 py-px rounded-sm">
          claims
        </code>{" "}
        joined to{" "}
        <code className="font-mono text-[11px] text-paper-mute bg-paper-warm/80 px-1 py-px rounded-sm">
          chunks
        </code>{" "}
        and{" "}
        <code className="font-mono text-[11px] text-paper-mute bg-paper-warm/80 px-1 py-px rounded-sm">
          source_files
        </code>
        , with citations on every memory card below.
      </p>
      <p className="font-sub text-[10px] tracking-wide text-paper-mute mb-10 max-w-[62ch]">
        filenames nudge classification (e.g. “transcript”, “syllabus”, “essay”).
        everything else routes through practice-style extraction until you add
        a sharper signal.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 gap-y-10">
        <div className="lg:col-span-7">
          <SourceUpload
            heading="drop files here (many at once)"
            onUploaded={onUploaded}
          />
        </div>
        <div className="lg:col-span-5 space-y-8">
          <SourceList reloadKey={reloadKey} />
          <MemoryFeed />
        </div>
      </div>
    </section>
  );
}

/**
 * Archivist — emits a single bookkeeping claim per source file:
 *   source_file_ingested(file_id, kind, filename)
 *
 * It's a degenerate "extractor": no LLM call, no chunk inspection. It
 * exists so the events feed gets a predictable signal that an upload
 * finished, regardless of which content extractor handled the file.
 *
 * The Archivist claim is the proof-of-presence for source files in the
 * memory graph — the dashboard's "what files have I uploaded" view
 * pulls from these claims, not from the source_files table directly,
 * so deletes and rejections fall out naturally.
 */

import type {
  Extractor,
  ExtractorContext,
  ExtractorResult,
  SourceKind,
} from "./types.js";

class ArchivistImpl implements Extractor {
  readonly name = "Archivist" as const;

  /** Archivist runs on every source kind. */
  handles(_kind: SourceKind): boolean {
    return true;
  }

  async run(ctx: ExtractorContext): Promise<ExtractorResult> {
    // We need at least one chunk to cite — the runner ensures this is
    // true by re-chunking the upload before extraction. If somehow we
    // got here with zero chunks, we degrade silently rather than block
    // the rest of the pipeline.
    const firstChunk = ctx.chunks[0];
    if (!firstChunk) {
      return {
        extractor: this.name,
        claims: [],
        errors: [
          { code: "no_chunks", message: "Archivist needs ≥1 chunk to cite" },
        ],
        usd: 0,
        ms: 0,
        model: null,
      };
    }

    return {
      extractor: this.name,
      claims: [
        {
          predicate: "source_file_ingested",
          subject_entity: "Student",
          object: {
            source_file_id: ctx.sourceFileId,
            kind: ctx.sourceKind,
            chunk_count: ctx.chunks.length,
          },
          confidence: 1,
          source_chunk_id: firstChunk.id,
          reasoning: "Source file was ingested into the knowledge graph.",
        },
      ],
      errors: [],
      usd: 0,
      ms: 0,
      model: null,
    };
  }
}

export const archivist: Extractor = new ArchivistImpl();

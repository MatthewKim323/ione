import { useMemo } from "react";
import katex from "katex";
import "../../styles/katex.css";

/**
 * Inline math renderer. Pass the LaTeX you want rendered as the `tex` prop;
 * if it parses we mount the compiled HTML, otherwise we fall back to the raw
 * source wrapped in a <code>. Designed to be safe against any string the
 * Reasoning Agent emits — KaTeX in `throwOnError: false` mode just returns
 * a red span on parse failure, so we use our own fallback to keep the
 * marginalia voice.
 *
 *   <Math tex="\\frac{a}{b}" />
 *   <Math tex="x = -3" display />
 */
export function Math({
  tex,
  display = false,
  className,
}: {
  tex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        output: "htmlAndMathml",
        trust: false,
      });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (!html) {
    return (
      <code
        className={["text-paper-dim", className].filter(Boolean).join(" ")}
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {tex}
      </code>
    );
  }

  return (
    <span
      className={className}
      // KaTeX returns its own sanitized HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Convenience: render a string that may contain $...$ or $$...$$ math
 * segments, splicing them as inline / display math respectively. Used by
 * HintCard so the tutor can drop "remember $-3 \cdot x = -3x$" naturally.
 */
export function MathInText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => splitMathSegments(text), [text]);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === "math" ? (
          <Math key={i} tex={seg.value} display={seg.display} />
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </span>
  );
}

type Segment =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

function splitMathSegments(input: string): Segment[] {
  const out: Segment[] = [];
  // Tokenize on $$...$$ and $...$. Greedy-but-bounded so a stray $ doesn't
  // eat the whole hint.
  const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) {
      out.push({ kind: "text", value: input.slice(last, m.index) });
    }
    const tex = (m[1] ?? m[2] ?? "").trim();
    out.push({ kind: "math", value: tex, display: Boolean(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    out.push({ kind: "text", value: input.slice(last) });
  }
  return out;
}

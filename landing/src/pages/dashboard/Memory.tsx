import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { KnowledgeGraphWorkspace } from "../../components/dashboard/KnowledgeGraphWorkspace";
import { MemoryInspector } from "../../components/dashboard/MemoryInspector";
import { ProposalReview } from "../../components/dashboard/ProposalReview";

class GraphSectionErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[dashboard/graph]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="mb-16">
          <div className="section-label-light mb-3">© ione — error</div>
          <div className="notebook-card ruled-paper-light p-8 sm:p-10 border-red-pencil/40">
            <h2
              className="h-display-light text-xl sm:text-2xl mb-3 text-ink-deep"
              style={{ fontStyle: "italic" }}
            >
              this view crashed.
            </h2>
            <p className="text-paper-faint text-sm leading-relaxed max-w-[60ch] mb-4">
              open the browser console and send the first red stack trace if
              you&apos;re filing a bug — usually it&apos;s bad data from the
              graph or a realtime edge case we can harden.
            </p>
            <pre className="font-mono text-[11px] text-red-pencil whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

export default function MemoryPage() {
  return (
    <DashboardShell>
      <GraphSectionErrorBoundary>
        <KnowledgeGraphWorkspace />
        <ProposalReview />
        <MemoryInspector />
      </GraphSectionErrorBoundary>
    </DashboardShell>
  );
}

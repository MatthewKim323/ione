import { motion } from "motion/react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { MemoryInspector } from "../../components/dashboard/MemoryInspector";
import { ProposalReview } from "../../components/dashboard/ProposalReview";

export default function MemoryPage() {
  return (
    <DashboardShell>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <ProposalReview />
        <MemoryInspector />
      </motion.div>
    </DashboardShell>
  );
}

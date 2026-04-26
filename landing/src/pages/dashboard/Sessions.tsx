import { motion } from "motion/react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { SessionsList } from "../../components/dashboard/SessionsList";

export default function SessionsPage() {
  return (
    <DashboardShell>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <SessionsList />
      </motion.div>
    </DashboardShell>
  );
}

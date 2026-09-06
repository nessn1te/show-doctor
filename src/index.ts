import type { LiveSetAdapter } from "./adapter.js";
import { runHealthCheck } from "./checks.js";
import { planStructure } from "./structure.js";
import type { Finding, HealthReport, ShowConfig } from "./types.js";

export { planStructure } from "./structure.js";
export { runHealthCheck } from "./checks.js";
export { SAMPLE_SHOW } from "./setlist.js";
export type { LiveSetAdapter } from "./adapter.js";
export {
  AbletonMcpClient,
  McpAdapter,
  normalizeSnapshot,
} from "./mcpAdapter.js";
export * from "./types.js";

/**
 * Run the full Show Doctor flow:
 *   1. Read the Set through the adapter
 *   2. Plan + apply structure (scene names/colors)
 *   3. Re-read and run the health check
 *   4. Return a printable report
 */
export async function runShowDoctor(
  adapter: LiveSetAdapter,
  show: ShowConfig
): Promise<{ report: HealthReport; text: string }> {
  const before = await adapter.readSet();
  const plan = planStructure(before, show);

  const blocking = plan.findings.some((f) => f.severity === "error");
  if (!blocking) {
    await adapter.applyPlan(plan);
  }

  const after = await adapter.readSet();
  const report = runHealthCheck(after, show);

  // Merge structure findings into the final report so nothing is hidden.
  const merged: HealthReport = {
    findings: [...plan.findings, ...report.findings],
    errorCount:
      report.errorCount +
      plan.findings.filter((f) => f.severity === "error").length,
    warningCount:
      report.warningCount +
      plan.findings.filter((f) => f.severity === "warning").length,
    showReady:
      report.showReady &&
      !plan.findings.some((f) => f.severity === "error"),
  };

  return { report: merged, text: formatReport(show.showName, merged) };
}

/** Plain-text report — readable in a popup, terminal, or printed backstage. */
export function formatReport(showName: string, report: HealthReport): string {
  const lines: string[] = [];
  lines.push(`SHOW DOCTOR — ${showName}`);
  lines.push(
    report.showReady
      ? `STATUS: SHOW READY (${report.warningCount} warning${report.warningCount === 1 ? "" : "s"})`
      : `STATUS: NOT READY — ${report.errorCount} error${report.errorCount === 1 ? "" : "s"}, ${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}`
  );
  lines.push("");

  const bySeverity: Array<Finding["severity"]> = ["error", "warning", "info"];
  for (const sev of bySeverity) {
    const group = report.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`— ${sev.toUpperCase()}S —`);
    for (const f of group) {
      lines.push(`  [${f.code}] ${f.message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

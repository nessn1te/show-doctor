import type { LiveSetModel, StructurePlan } from "./types.js";

/**
 * Boundary between external Live data and pure validation logic.
 * Mock/demo adapters apply plans in memory. The current MCP adapter reads
 * snapshots and records unsupported scene edits for a manual checklist.
 */
export interface LiveSetAdapter {
  readSet(): Promise<LiveSetModel>;
  applyPlan(plan: StructurePlan): Promise<void>;
}

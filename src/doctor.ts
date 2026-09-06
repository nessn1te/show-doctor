/**
 * Run Show Doctor against the Live Set that is open right now, via the
 * AbletonMCP Remote Script socket.
 *
 *   npm run doctor
 *
 * Exit codes: 0 = SHOW READY, 1 = NOT READY, 2 = could not reach Live.
 */

import { SAMPLE_SHOW, runShowDoctor } from "./index.js";
import { AbletonMcpClient, McpAdapter } from "./mcpAdapter.js";

const client = new AbletonMcpClient();

try {
  await client.connect();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}

const adapter = new McpAdapter(client);
const { report, text } = await runShowDoctor(adapter, SAMPLE_SHOW);

console.log(text);

const plan = adapter.unapplied;
if (plan && (plan.renames.length > 0 || plan.recolors.length > 0)) {
  console.log("");
  console.log("— MANUAL STEPS (AbletonMCP cannot rename/recolor scenes) —");
  for (const r of plan.renames) {
    console.log(`  Rename scene ${r.sceneIndex + 1}: "${r.from}" → "${r.to}"`);
  }
  if (plan.recolors.length > 0) {
    console.log(
      `  Scene colors (unreadable via MCP — skip any already set correctly):`
    );
    for (const c of plan.recolors) {
      console.log(`    Scene ${c.sceneIndex + 1} → ${c.color}`);
    }
  }
}

client.close();
process.exit(report.showReady ? 0 : 1);

/**
 * Demo: run Show Doctor against a mock Set with two realistic problems —
 * the click routed to Main, and a deleted LM Drum pattern — and print the
 * CLI report using fictional fixture data.
 *
 *   npm run build && node dist/src/demo.js
 */
import type { LiveSetAdapter } from "./adapter.js";
import { runShowDoctor } from "./index.js";
import { SAMPLE_SHOW } from "./setlist.js";
import { UNKNOWN_ROUTING, type LiveSetModel, type StructurePlan, type Track } from "./types.js";

function makeTrack(
  name: string,
  kind: Track["kind"],
  outputRouting: string,
  clipScenes: number[],
  sceneCount: number
): Track {
  return {
    name,
    kind,
    outputRouting,
    clipSlots: Array.from({ length: sceneCount }, (_, i) => ({
      sceneIndex: i,
      hasClip: clipScenes.includes(i),
      clipName: clipScenes.includes(i) ? `${name} ${i + 1}` : undefined,
    })),
  };
}

// A messy pre-show Set: default scene names, click to Main, missing pattern.
const messySet: LiveSetModel = {
  tempo: 120,
  tracks: [
    makeTrack("LM Sync", "midi", "LM Drum (USB)", [0, 1, 2, 4, 5, 6], 7), // scene 4 pattern deleted
    makeTrack("Cue/Click", "midi", "Main", [0, 1, 2, 3, 4, 5, 6], 7), // WRONG: routed to Main
    makeTrack("Guitar", "audio", "Main", [], 7),
    makeTrack("Vocal", "audio", "Main", [], 7),
    makeTrack("Backing", "audio", "Main", [2, 4], 7),
  ],
  scenes: Array.from({ length: 7 }, (_, i) => ({
    index: i,
    name: String(i + 1), // default numbered scenes
  })),
};

class DemoAdapter implements LiveSetAdapter {
  constructor(private model: LiveSetModel) {}
  async readSet(): Promise<LiveSetModel> {
    return structuredClone(this.model);
  }
  async applyPlan(plan: StructurePlan): Promise<void> {
    for (const r of plan.renames) this.model.scenes[r.sceneIndex].name = r.to;
    for (const c of plan.recolors)
      this.model.scenes[c.sceneIndex].color = c.color;
  }
}

console.log("DEMO 1 — BROKEN SET (mock data)\n");
const broken = await runShowDoctor(new DemoAdapter(structuredClone(messySet)), SAMPLE_SHOW);
console.log(broken.text);

const fixedSet = structuredClone(messySet);
fixedSet.tracks.find(t => t.name === "Cue/Click")!.outputRouting = "Cue Out 3/4";
fixedSet.tracks.find(t => t.name === "LM Sync")!.clipSlots[3].hasClip = true;
console.log("\nDEMO 2 — CORRECTED SET (mock data)\n");
const fixed = await runShowDoctor(new DemoAdapter(fixedSet), SAMPLE_SHOW);
console.log(fixed.text);

for (const track of fixedSet.tracks) track.outputRouting = UNKNOWN_ROUTING;
console.log("\nDEMO 3 — ROUTING NEEDS MANUAL VERIFICATION (mock data)\n");
const unknown = await runShowDoctor(new DemoAdapter(fixedSet), SAMPLE_SHOW);
console.log(unknown.text);

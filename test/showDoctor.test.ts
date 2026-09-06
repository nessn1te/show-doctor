import assert from "node:assert/strict";
import { test } from "node:test";

import type { LiveSetAdapter } from "../src/adapter.js";
import { runHealthCheck } from "../src/checks.js";
import { runShowDoctor } from "../src/index.js";
import { SAMPLE_SHOW } from "../src/setlist.js";
import { planStructure } from "../src/structure.js";
import { normalizeSnapshot, type SessionSnapshot } from "../src/mcpAdapter.js";
import {
  UNKNOWN_ROUTING,
  type LiveSetModel,
  type StructurePlan,
  type Track,
} from "../src/types.js";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

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

/** A fully correct 7-song Set matching SAMPLE_SHOW. */
function healthySet(): LiveSetModel {
  const n = 7;
  const all = [0, 1, 2, 3, 4, 5, 6];
  return {
    tempo: 120,
    tracks: [
      makeTrack("LM Sync", "midi", "LM Drum (USB)", all, n),
      makeTrack("Cue/Click", "midi", "Cue Out 3/4", all, n),
      makeTrack("Guitar", "audio", "Main", [], n),
      makeTrack("Vocal", "audio", "Main", [], n),
      makeTrack("Backing", "audio", "Main", [2, 4], n), // sample songs 3 and 5
    ],
    scenes: SAMPLE_SHOW.songs.map((s, i) => ({
      index: i,
      name: s.sceneName,
      color: s.color,
    })),
  };
}

class MockAdapter implements LiveSetAdapter {
  applied: StructurePlan | null = null;
  constructor(private model: LiveSetModel) {}

  async readSet(): Promise<LiveSetModel> {
    return structuredClone(this.model);
  }

  async applyPlan(plan: StructurePlan): Promise<void> {
    this.applied = plan;
    for (const r of plan.renames) this.model.scenes[r.sceneIndex].name = r.to;
    for (const c of plan.recolors)
      this.model.scenes[c.sceneIndex].color = c.color;
  }
}

/* ------------------------------------------------------------------ */
/* Health check                                                        */
/* ------------------------------------------------------------------ */

test("healthy set passes with no errors", () => {
  const report = runHealthCheck(healthySet(), SAMPLE_SHOW);
  assert.equal(report.errorCount, 0);
  assert.equal(report.showReady, true);
});

test("missing required track is an error", () => {
  const model = healthySet();
  model.tracks = model.tracks.filter((t) => t.name !== "Vocal");
  const report = runHealthCheck(model, SAMPLE_SHOW);
  assert.equal(report.showReady, false);
  assert.ok(report.findings.some((f) => f.code === "MISSING_TRACK"));
});

test("click routed to Main is an error", () => {
  const model = healthySet();
  model.tracks.find((t) => t.name === "Cue/Click")!.outputRouting = "Main";
  const report = runHealthCheck(model, SAMPLE_SHOW);
  assert.equal(report.showReady, false);
  const finding = report.findings.find((f) => f.code === "BAD_ROUTING");
  assert.ok(finding);
  assert.match(finding.message, /Cue\/Click/);
});

test("missing required clip (deleted LM pattern) is an error", () => {
  const model = healthySet();
  const lm = model.tracks.find((t) => t.name === "LM Sync")!;
  lm.clipSlots[3].hasClip = false; // Breather's drum pattern got deleted
  const report = runHealthCheck(model, SAMPLE_SHOW);
  assert.equal(report.showReady, false);
  const finding = report.findings.find((f) => f.code === "MISSING_CLIP");
  assert.ok(finding);
  assert.match(finding.message, /BREATHER/);
});

test("unexpected clip on a live-only track is a warning, not an error", () => {
  const model = healthySet();
  const gtr = model.tracks.find((t) => t.name === "Guitar")!;
  gtr.clipSlots[0].hasClip = true;
  gtr.clipSlots[0].clipName = "old take";
  const report = runHealthCheck(model, SAMPLE_SHOW);
  assert.equal(report.showReady, true); // warnings don't block
  assert.ok(report.findings.some((f) => f.code === "UNEXPECTED_CLIP"));
});

test("tempo mismatch is flagged when a song declares an expected tempo", () => {
  const show = structuredClone(SAMPLE_SHOW);
  show.songs[0].tempo = 140;
  const model = healthySet(); // set tempo 120, no scene override
  const report = runHealthCheck(model, show);
  const finding = report.findings.find((f) => f.code === "TEMPO_MISMATCH");
  assert.ok(finding);
  assert.match(finding.message, /140/);
});

/* ------------------------------------------------------------------ */
/* Structure pass                                                      */
/* ------------------------------------------------------------------ */

test("structure pass renames and recolors default scenes", () => {
  const model = healthySet();
  model.scenes = model.scenes.map((s, i) => ({
    ...s,
    name: String(i + 1), // Ableton default numbered scenes
    color: undefined,
  }));
  const plan = planStructure(model, SAMPLE_SHOW);
  assert.equal(plan.renames.length, 7);
  assert.equal(plan.recolors.length, 7);
  assert.equal(plan.renames[0].to, "01 · OPENER");
});

test("structure pass is a no-op on an already-correct set", () => {
  const plan = planStructure(healthySet(), SAMPLE_SHOW);
  assert.equal(plan.renames.length, 0);
  assert.equal(plan.recolors.length, 0);
});

test("too few scenes blocks the structure pass with an error", () => {
  const model = healthySet();
  model.scenes = model.scenes.slice(0, 4);
  const plan = planStructure(model, SAMPLE_SHOW);
  assert.ok(plan.findings.some((f) => f.code === "TOO_FEW_SCENES"));
});

/* ------------------------------------------------------------------ */
/* Full flow through the adapter                                       */
/* ------------------------------------------------------------------ */

test("full flow: messy set gets structured, then passes health check", async () => {
  const model = healthySet();
  model.scenes = model.scenes.map((s, i) => ({
    index: i,
    name: String(i + 1),
    color: undefined,
  }));
  const adapter = new MockAdapter(model);

  const { report, text } = await runShowDoctor(adapter, SAMPLE_SHOW);

  assert.ok(adapter.applied, "structure plan should have been applied");
  assert.equal(report.showReady, true);
  assert.match(text, /SHOW READY/);
  assert.match(text, /SHOW DOCTOR — Example Live Set/);
});

test("full flow: broken routing produces NOT READY report", async () => {
  const model = healthySet();
  model.tracks.find((t) => t.name === "Cue/Click")!.outputRouting = "Main";
  const adapter = new MockAdapter(model);

  const { report, text } = await runShowDoctor(adapter, SAMPLE_SHOW);

  assert.equal(report.showReady, false);
  assert.match(text, /NOT READY/);
  assert.match(text, /BAD_ROUTING/);
});

/* ------------------------------------------------------------------ */
/* MCP adapter                                                         */
/* ------------------------------------------------------------------ */

test("unreadable routing downgrades to a warning instead of passing silently", () => {
  const model = healthySet();
  for (const t of model.tracks) t.outputRouting = UNKNOWN_ROUTING;
  const report = runHealthCheck(model, SAMPLE_SHOW);
  assert.equal(report.showReady, true); // warning, not error
  const flags = report.findings.filter((f) => f.code === "ROUTING_UNVERIFIABLE");
  assert.equal(flags.length, SAMPLE_SHOW.routingRules.length);
  assert.ok(!report.findings.some((f) => f.code === "BAD_ROUTING"));
});

test("normalizeSnapshot maps an AbletonMCP snapshot to LiveSetModel", () => {
  const snap: SessionSnapshot = {
    session: { tempo: 122 },
    tracks: [
      {
        index: 0,
        name: "LM Sync",
        is_audio_track: false,
        is_midi_track: true,
        clip_slots: [
          { index: 0, has_clip: true, clip: { name: "LM 1" } },
          { index: 1, has_clip: false, clip: null },
        ],
      },
      {
        index: 1,
        name: "Guitar",
        is_audio_track: true,
        is_midi_track: false,
        clip_slots: [
          { index: 0, has_clip: false, clip: null },
          { index: 1, has_clip: false, clip: null },
        ],
      },
    ],
    scenes: [
      { index: 0, name: "01 · OPENER", tempo: 98 },
      { index: 1, name: "2", tempo: -1 }, // -1 = no scene tempo set in Live
    ],
  };

  const model = normalizeSnapshot(snap);

  assert.equal(model.tempo, 122);
  assert.equal(model.tracks[0].kind, "midi");
  assert.equal(model.tracks[1].kind, "audio");
  assert.equal(model.tracks[0].outputRouting, UNKNOWN_ROUTING);
  assert.deepEqual(model.tracks[0].clipSlots[0], {
    sceneIndex: 0,
    hasClip: true,
    clipName: "LM 1",
  });
  assert.equal(model.tracks[0].clipSlots[1].hasClip, false);
  assert.equal(model.scenes[0].tempo, 98);
  assert.equal(model.scenes[1].tempo, undefined);
  assert.equal(model.scenes[1].color, undefined);
});

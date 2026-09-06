import {
  UNKNOWN_ROUTING,
  type Finding,
  type HealthReport,
  type LiveSetModel,
  type ShowConfig,
} from "./types.js";

/**
 * Pass 2 — Health check.
 *
 * Runs every pre-show validation rule against the Set model and returns a
 * report. Pure function, fully unit-testable. Severity philosophy:
 *
 *   error   — would audibly break the show (missing track, click to FOH,
 *             missing required clip)
 *   warning — could confuse you on stage but won't break audio
 *             (unnamed scene, unexpected clip, tempo mismatch)
 */
export function runHealthCheck(
  model: LiveSetModel,
  show: ShowConfig
): HealthReport {
  const findings: Finding[] = [];

  checkRequiredTracks(model, show, findings);
  checkRouting(model, show, findings);
  checkClipExpectations(model, show, findings);
  checkSceneNaming(model, show, findings);
  checkTempo(model, show, findings);

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  return { findings, errorCount, warningCount, showReady: errorCount === 0 };
}

/* ------------------------------------------------------------------ */

function checkRequiredTracks(
  model: LiveSetModel,
  show: ShowConfig,
  findings: Finding[]
): void {
  const names = model.tracks.map((t) => t.name);
  for (const required of show.requiredTracks) {
    if (!names.includes(required)) {
      findings.push({
        severity: "error",
        code: "MISSING_TRACK",
        message: `Required track "${required}" is missing from the Set.`,
      });
    }
  }
}

function checkRouting(
  model: LiveSetModel,
  show: ShowConfig,
  findings: Finding[]
): void {
  for (const rule of show.routingRules) {
    const track = model.tracks.find((t) => t.name === rule.trackName);
    if (!track) continue; // MISSING_TRACK already covers this
    if (track.outputRouting === UNKNOWN_ROUTING) {
      findings.push({
        severity: "warning",
        code: "ROUTING_UNVERIFIABLE",
        message: `Cannot read output routing for "${rule.trackName}" through this adapter — verify by hand: ${rule.reason}`,
      });
      continue;
    }
    const routing = track.outputRouting.toLowerCase();
    for (const forbidden of rule.mustNotRouteTo) {
      if (routing.includes(forbidden.toLowerCase())) {
        findings.push({
          severity: "error",
          code: "BAD_ROUTING",
          message: `"${rule.trackName}" is routed to "${track.outputRouting}". ${rule.reason}`,
        });
        break;
      }
    }
  }
}

function checkClipExpectations(
  model: LiveSetModel,
  show: ShowConfig,
  findings: Finding[]
): void {
  show.songs.forEach((song, sceneIndex) => {
    for (const [trackName, mustHaveClip] of Object.entries(song.expectClips)) {
      const track = model.tracks.find((t) => t.name === trackName);
      if (!track) continue; // MISSING_TRACK already covers this
      const slot = track.clipSlots.find((s) => s.sceneIndex === sceneIndex);
      const hasClip = slot?.hasClip ?? false;

      if (mustHaveClip && !hasClip) {
        findings.push({
          severity: "error",
          code: "MISSING_CLIP",
          message: `Scene ${sceneIndex + 1} ("${song.sceneName}"): "${trackName}" has no clip but one is required. This slot would fire silence.`,
        });
      } else if (!mustHaveClip && hasClip) {
        findings.push({
          severity: "warning",
          code: "UNEXPECTED_CLIP",
          message: `Scene ${sceneIndex + 1} ("${song.sceneName}"): "${trackName}" has a clip ("${slot?.clipName ?? "unnamed"}") but this track is meant to be live-only for this song. It will fire when the scene launches.`,
        });
      }
    }
  });
}

function checkSceneNaming(
  model: LiveSetModel,
  show: ShowConfig,
  findings: Finding[]
): void {
  const showSceneCount = Math.min(model.scenes.length, show.songs.length);
  for (let i = 0; i < showSceneCount; i++) {
    const name = model.scenes[i].name.trim();
    if (name === "" || /^\d+$/.test(name)) {
      findings.push({
        severity: "warning",
        code: "UNNAMED_SCENE",
        message: `Scene ${i + 1} is unnamed (or default-numbered). Under stage lights you want every scene labeled — run the structure pass.`,
      });
    }
  }
}

function checkTempo(
  model: LiveSetModel,
  show: ShowConfig,
  findings: Finding[]
): void {
  show.songs.forEach((song, i) => {
    if (song.tempo === undefined) return;
    const scene = model.scenes[i];
    if (!scene) return;
    const effective = scene.tempo ?? model.tempo;
    if (Math.abs(effective - song.tempo) > 0.01) {
      findings.push({
        severity: "warning",
        code: "TEMPO_MISMATCH",
        message: `Scene ${i + 1} ("${song.sceneName}") will play at ${effective} BPM but the setlist expects ${song.tempo} BPM. Set a scene tempo or update the setlist.`,
      });
    }
  });
}

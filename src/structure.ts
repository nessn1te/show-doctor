import type {
  Finding,
  LiveSetModel,
  ShowConfig,
  StructurePlan,
} from "./types.js";

/**
 * Pass 1 — Structure.
 *
 * Compares the Set's scenes against the setlist and produces a plan of
 * renames + recolors to apply. Pure function: it never mutates the model,
 * it only describes what should change. The adapter applies the plan.
 */
export function planStructure(
  model: LiveSetModel,
  show: ShowConfig
): StructurePlan {
  const findings: Finding[] = [];
  const renames: StructurePlan["renames"] = [];
  const recolors: StructurePlan["recolors"] = [];

  if (model.scenes.length < show.songs.length) {
    findings.push({
      severity: "error",
      code: "TOO_FEW_SCENES",
      message: `Setlist has ${show.songs.length} songs but the Set only has ${model.scenes.length} scene(s). Add ${
        show.songs.length - model.scenes.length
      } more scene(s) before running the structure pass.`,
    });
    return { renames, recolors, findings };
  }

  if (model.scenes.length > show.songs.length) {
    findings.push({
      severity: "warning",
      code: "EXTRA_SCENES",
      message: `Set has ${model.scenes.length - show.songs.length} scene(s) beyond the ${show.songs.length}-song setlist. They won't be renamed — delete them if they're leftovers, or they'll sit below the show in Session View.`,
    });
  }

  show.songs.forEach((song, i) => {
    const scene = model.scenes[i];
    if (scene.name !== song.sceneName) {
      renames.push({ sceneIndex: i, from: scene.name, to: song.sceneName });
    }
    if (scene.color?.toLowerCase() !== song.color.toLowerCase()) {
      recolors.push({ sceneIndex: i, color: song.color });
    }
  });

  findings.push({
    severity: "info",
    code: "STRUCTURE_PLAN",
    message: `Structure plan: ${renames.length} rename(s), ${recolors.length} recolor(s).`,
  });

  return { renames, recolors, findings };
}

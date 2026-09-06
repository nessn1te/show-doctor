import type { ShowConfig } from "./types.js";

/** Fictional seven-song configuration for the demo. Adapt it to your own set. */
export const SAMPLE_SHOW: ShowConfig = {
  showName: "Example Live Set",

  requiredTracks: ["LM Sync", "Cue/Click", "Guitar", "Vocal", "Backing"],

  routingRules: [
    {
      trackName: "Cue/Click",
      mustNotRouteTo: ["main", "master"],
      reason: "Click must never reach FOH — route to the cue/headphone bus.",
    },
    {
      trackName: "LM Sync",
      mustNotRouteTo: ["main", "master"],
      reason:
        "LM Drum audio goes direct to the house board; its MIDI track must not hit Main.",
    },
  ],

  songs: [
    {
      sceneName: "01 · OPENER",
      color: "#e5484d",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: false,
      },
    },
    {
      sceneName: "02 · SONG TWO",
      color: "#e5a03b",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: false,
      },
    },
    {
      sceneName: "03 · SONG THREE",
      color: "#8e4ec6",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: true, // pad/synth bed under this one
      },
    },
    {
      sceneName: "04 · BREATHER",
      color: "#3b82a0",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: false,
      },
    },
    {
      sceneName: "05 · SONG FIVE",
      color: "#8e4ec6",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: true, // pad/synth bed under this one
      },
    },
    {
      sceneName: "06 · SONG SIX",
      color: "#e5a03b",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: false,
      },
    },
    {
      sceneName: "07 · CLOSER",
      color: "#e5484d",
      expectClips: {
        "LM Sync": true,
        "Cue/Click": true,
        Guitar: false,
        Vocal: false,
        Backing: false,
      },
    },
  ],
};

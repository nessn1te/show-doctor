/**
 * Normalized model of a Live Set — everything Show Doctor operates on.
 *
 * This is deliberately SDK-agnostic: an external-data adapter
 * (see adapter.ts) is responsible for translating the real Live Set into this
 * shape. All structure/health logic works against these types only, so it
 * can be fully unit-tested without Live running.
 */

export type TrackKind = "midi" | "audio" | "return" | "main";

/**
 * Sentinel for Track.outputRouting when the adapter cannot read routing at
 * all (the AbletonMCP protocol does not expose it). The routing check treats
 * this as "verify manually" — a warning — rather than silently passing.
 */
export const UNKNOWN_ROUTING = "(unverifiable)";

export interface ClipSlot {
  /** Scene index this slot belongs to. */
  sceneIndex: number;
  /** Whether a clip exists in this slot. */
  hasClip: boolean;
  /** Clip name, if present. */
  clipName?: string;
}

export interface Track {
  name: string;
  kind: TrackKind;
  /** Output routing as a display string, e.g. "Main", "Cue Out", "Ext. Out 3/4". */
  outputRouting: string;
  clipSlots: ClipSlot[];
}

export interface Scene {
  index: number;
  name: string;
  /** Color as hex string if available, undefined if default/unset. */
  color?: string;
  /** Scene tempo override, if set (BPM). */
  tempo?: number;
  /** Scene time signature override, e.g. "4/4", if set. */
  timeSignature?: string;
}

export interface LiveSetModel {
  tracks: Track[];
  scenes: Scene[];
  /** Set-level tempo (BPM). */
  tempo: number;
}

/* ------------------------------------------------------------------ */
/* Setlist configuration — the show, as data                           */
/* ------------------------------------------------------------------ */

export interface SongConfig {
  /** Scene name to apply, e.g. "01 · Opener". */
  sceneName: string;
  /** Hex color to apply to the scene. */
  color: string;
  /**
   * Per-track clip expectations, keyed by track name.
   * true  = a clip MUST exist in this song's slot
   * false = the slot MUST be empty (live-only track)
   * omitted = no expectation (either is fine)
   */
  expectClips: Record<string, boolean>;
  /** Expected tempo for this song (BPM), if it differs from Set tempo. */
  tempo?: number;
}

export interface ShowConfig {
  showName: string;
  /** Track names that must exist, in order. */
  requiredTracks: string[];
  /**
   * Tracks whose output routing must NOT contain any of the forbidden
   * substrings (case-insensitive). Used to catch e.g. click routed to Main.
   */
  routingRules: Array<{
    trackName: string;
    mustNotRouteTo: string[];
    reason: string;
  }>;
  songs: SongConfig[];
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  /** Short machine-friendly code, e.g. "MISSING_TRACK". */
  code: string;
  /** Human-readable message shown in the report. */
  message: string;
}

export interface StructurePlan {
  /** Scene renames to apply: sceneIndex -> new name. */
  renames: Array<{ sceneIndex: number; from: string; to: string }>;
  /** Scene colors to apply: sceneIndex -> hex color. */
  recolors: Array<{ sceneIndex: number; color: string }>;
  findings: Finding[];
}

export interface HealthReport {
  findings: Finding[];
  errorCount: number;
  warningCount: number;
  /** True when there are zero errors (warnings allowed). */
  showReady: boolean;
}

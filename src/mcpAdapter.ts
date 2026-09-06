import net from "node:net";

import type { LiveSetAdapter } from "./adapter.js";
import {
  UNKNOWN_ROUTING,
  type LiveSetModel,
  type StructurePlan,
} from "./types.js";

/**
 * LiveSetAdapter backed by the AbletonMCP Remote Script (ahujasid/ableton-mcp).
 *
 * Talks directly to the Remote Script's TCP socket on localhost:9877 using
 * the same JSON protocol the ableton-mcp MCP server uses internally — one
 * request `{"type": ..., "params": ...}` per response `{"status", "result"}`.
 * The Remote Script accepts multiple concurrent clients, so this coexists
 * with an MCP server connection from a chat client.
 *
 * Known protocol limits (ableton-mcp 1.3.9 / script 1.7.0), verified against
 * the package source:
 *   - No track output routing in any readable command → outputRouting is
 *     reported as UNKNOWN_ROUTING and the routing check downgrades to a
 *     "verify manually" warning instead of silently passing.
 *   - No scene color read/write and no scene rename command → applyPlan()
 *     cannot write the structure plan into Live; it records the plan so the
 *     CLI can print it as manual steps.
 */

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9877;
const RESPONSE_TIMEOUT_MS = 12_000;

export class AbletonMcpClient {
  private sock: net.Socket | null = null;

  constructor(
    private host = DEFAULT_HOST,
    private port = DEFAULT_PORT
  ) {}

  async connect(): Promise<void> {
    if (this.sock) return;
    this.sock = await new Promise<net.Socket>((resolve, reject) => {
      const sock = net.createConnection({ host: this.host, port: this.port });
      sock.once("connect", () => {
        sock.removeAllListeners("error");
        resolve(sock);
      });
      sock.once("error", (err) => {
        reject(
          new Error(
            `Could not reach the AbletonMCP Remote Script on ${this.host}:${this.port} (${err.message}).\n` +
              `Is Live open with "AbletonMCP" selected as a Control Surface ` +
              `(Settings → Link/Tempo/MIDI)?`
          )
        );
      });
    });
  }

  close(): void {
    this.sock?.destroy();
    this.sock = null;
  }

  /**
   * One command round-trip. The protocol has no length framing — the
   * response is done when the accumulated buffer parses as JSON.
   */
  async sendCommand(
    type: string,
    params: Record<string, unknown> = {}
  ): Promise<any> {
    await this.connect();
    const sock = this.sock!;

    return new Promise((resolve, reject) => {
      let buf = "";

      const cleanup = () => {
        clearTimeout(timer);
        sock.off("data", onData);
        sock.off("error", onError);
        sock.off("close", onClose);
      };

      const onData = (chunk: Buffer) => {
        buf += chunk.toString("utf-8");
        let response: any;
        try {
          response = JSON.parse(buf);
        } catch {
          return; // incomplete JSON — keep reading
        }
        cleanup();
        if (response.status === "error") {
          reject(new Error(`Ableton error for "${type}": ${response.message}`));
        } else {
          resolve(response.result ?? {});
        }
      };

      const onError = (err: Error) => {
        cleanup();
        this.close();
        reject(new Error(`Socket error during "${type}": ${err.message}`));
      };

      const onClose = () => {
        cleanup();
        this.close();
        reject(new Error(`Connection closed during "${type}".`));
      };

      const timer = setTimeout(() => {
        cleanup();
        this.close();
        reject(
          new Error(`Timed out after ${RESPONSE_TIMEOUT_MS}ms waiting for "${type}".`)
        );
      }, RESPONSE_TIMEOUT_MS);

      sock.on("data", onData);
      sock.once("error", onError);
      sock.once("close", onClose);
      sock.write(JSON.stringify({ type, params }));
    });
  }
}

/* ------------------------------------------------------------------ */
/* Snapshot normalization                                              */
/* ------------------------------------------------------------------ */

/** The subset of ableton_mcp_snapshot_v2 that Show Doctor consumes. */
export interface SessionSnapshot {
  session: { tempo: number };
  tracks: Array<{
    index: number;
    name: string;
    is_audio_track: boolean;
    is_midi_track: boolean;
    clip_slots: Array<{
      index: number;
      has_clip: boolean;
      clip: { name?: string } | null;
    }>;
  }>;
  scenes: Array<{
    index: number;
    name: string;
    tempo?: number | null;
  }>;
}

/** Pure translation from a get_session_snapshot payload to LiveSetModel. */
export function normalizeSnapshot(snap: SessionSnapshot): LiveSetModel {
  return {
    tempo: snap.session.tempo,
    tracks: snap.tracks.map((t) => ({
      name: t.name,
      kind: t.is_midi_track ? ("midi" as const) : ("audio" as const),
      outputRouting: UNKNOWN_ROUTING,
      clipSlots: t.clip_slots.map((s) => ({
        sceneIndex: s.index,
        hasClip: Boolean(s.has_clip),
        clipName: s.clip?.name ?? undefined,
      })),
    })),
    scenes: snap.scenes.map((s) => ({
      index: s.index,
      name: s.name,
      // Live reports -1 for "no scene tempo set"; treat non-positive as unset.
      tempo: s.tempo != null && s.tempo > 0 ? s.tempo : undefined,
      color: undefined, // not exposed by the protocol
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export class McpAdapter implements LiveSetAdapter {
  /** The last plan applyPlan() received but could not write into Live. */
  unapplied: StructurePlan | null = null;

  constructor(private client: AbletonMcpClient) {}

  async readSet(): Promise<LiveSetModel> {
    const snap = await this.client.sendCommand("get_session_snapshot", {
      include_notes: false,
      include_params: false,
    });
    return normalizeSnapshot(snap as SessionSnapshot);
  }

  async applyPlan(plan: StructurePlan): Promise<void> {
    // No scene rename/recolor commands exist in the protocol; surface the
    // plan as manual steps instead of pretending it was applied.
    this.unapplied = plan;
  }
}

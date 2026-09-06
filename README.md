# Show Doctor

**Catch missing clips, tracks, and setlist problems before a live performance.**

Show Doctor is a TypeScript command-line tool by [Ness Nite](https://nessnite.art). It compares an Ableton Live set against a configurable show plan and turns mismatches into a readable report.

This public edition uses a fictional seven-song setlist. You can run the demo and tests without Ableton, credentials, or an external service.

## Try it

Use Node.js 22 or newer and npm.

```sh
git clone https://github.com/nessn1te/show-doctor.git
cd show-doctor
npm ci
npm test
npm run demo
```

The demo prints three scenarios: a broken set, a corrected set, and a set whose routing needs manual verification. A broken-set report includes:

```text
SHOW DOCTOR — Example Live Set
STATUS: NOT READY — 2 errors, 0 warnings

— ERRORS —
  [BAD_ROUTING] "Cue/Click" is routed to "Main". Click must never reach FOH — route to the cue/headphone bus.
  [MISSING_CLIP] Scene 4 ("04 · BREATHER"): "LM Sync" has no clip but one is required. This slot would fire silence.
```

Excerpt from the mock demo. FOH means the front-of-house speakers heard by the audience.

## What it checks

- Required tracks and clips are present.
- Live-only tracks do not contain unexpected clips.
- Scene counts, names, and expected tempos match the show plan.
- Routing rules are checked when the adapter supplies routing information; otherwise the report requests a manual check.
- A structure plan describes scene renames and colors.

## How it works

```text
Live snapshot or mock fixture
          |
          v
    LiveSetAdapter
          |
          v
    LiveSetModel + ShowConfig
          |
          v
  Structure plan -> health checks -> report
```

The domain logic uses a normalized model rather than depending on a particular Ableton integration. Structure planning and health checks are pure functions. The mock adapter applies changes in memory; the current live adapter prints unsupported edits as manual steps.

Start with these files:

| File | Responsibility |
|---|---|
| [src/checks.ts](src/checks.ts) | Validation rules and structured findings |
| [src/structure.ts](src/structure.ts) | Scene-name/color planning without mutating input |
| [src/types.ts](src/types.ts) | Shared input and result contracts |
| [src/adapter.ts](src/adapter.ts) | External integration boundary |
| [src/index.ts](src/index.ts) | Orchestration and report formatting |
| [src/demo.ts](src/demo.ts) | Runnable fictional scenarios |
| [test/showDoctor.test.ts](test/showDoctor.test.ts) | Behavior and adapter-normalization tests |

## Verification and limits

The 13 tests cover missing tracks/clips, incorrect and unknown routing, unexpected clips, tempo mismatch, structure planning, orchestration, and snapshot normalization. They run without a live Ableton instance. Compilation and these tests were exercised for this public edition; a live integration run was not performed as part of preparing it.

`SHOW READY` currently means **no errors found by the configured checks**. Warnings can remain, including unverified routing. It does not mean every performance requirement has been verified. Review all warnings and the manual checklist.

The socket adapter expects the snapshot protocol documented in its source for ableton-mcp 1.3.9 / Remote Script 1.7.0. It does not read output routing or scene colors, or apply scene rename/color changes. Compatibility with newer upstream versions is not claimed. The socket client is used sequentially by the CLI and is not a general concurrent transport.

## Optional: inspect a Live set

Configure the [AbletonMCP Remote Script](https://github.com/ahujasid/ableton-mcp#installing-the-ableton-remote-script) following the upstream instructions. Show Doctor connects directly to its local TCP socket at `127.0.0.1:9877`; it does not require an LLM or chat client for its own checks.

Adapt [src/setlist.ts](src/setlist.ts) to your track names, scene order, clip expectations, and tempos, then run:

```sh
npm run doctor
```

The current adapter reads the set and prints scene changes as manual steps. CLI exit codes are `0` for no reported errors, `1` for reported validation errors, and `2` for an initial connection failure. An unexpected later runtime failure can exit separately through Node's error handling.

## Design tradeoffs

- **Explicit unknowns:** unavailable routing becomes a visible warning, rather than fabricated data.
- **Configuration as data:** setlist changes belong in `ShowConfig`, keeping validation reusable.
- **Adapter isolation:** a richer integration can implement the same interface while retaining the domain tests.
- **Small review surface:** no web dashboard or database is needed for the current workflow.

## Next improvements

- Distinguish “manual checks required” from the current zero-error status.
- Add socket-level failure tests and stronger runtime snapshot validation.
- Verify compatibility against a specific live Ableton/Remote Script combination.

## Attribution

Show Doctor is a separate tool that integrates with [ahujasid/ableton-mcp](https://github.com/ahujasid/ableton-mcp). The Remote Script is maintained upstream and is not bundled here.

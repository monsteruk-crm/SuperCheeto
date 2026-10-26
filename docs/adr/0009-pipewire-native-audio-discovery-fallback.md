# ADR 0009: PipeWire-Native Audio Discovery Fallback

## Status
Accepted

## Context
The desktop app needs to discover monitor and microphone sources on Ubuntu/Linux so it can start system-audio capture and let the user switch inputs. The original implementation depended on `pactl` for discovery. On minimal PipeWire installs, `pw-cat`/`pw-dump` may be present while `pactl` (`pulseaudio-utils`) is not, which made startup fail even though the audio server was running.

## Decision
- Keep `pactl` as the preferred discovery path when it is available.
- Add a PipeWire-native fallback that parses `pw-dump` node metadata to enumerate sink, monitor, and microphone source names.
- Preserve the existing capture commands (`parec` first, `pw-cat` fallback) and the existing WebSocket/source-selection contract.

## Alternatives considered
- Require `pulseaudio-utils` everywhere:
  - Pros: smallest implementation change, keeps discovery logic simple.
  - Cons: makes fresh PipeWire setups brittle and adds an unnecessary host dependency.
- Replace discovery with `wpctl` only:
  - Pros: PipeWire-native and already installed on many systems.
  - Cons: less direct access to node names than `pw-dump` and more command-specific parsing risk.

## Consequences
- Startup is more resilient on new machines that already have PipeWire tools but not `pactl`.
- Audio source enumeration now has two parsing paths, so tests cover both the legacy Pulse output and PipeWire JSON output.
- Default sink/source selection from the fallback path is best-effort if the host does not expose explicit defaults.

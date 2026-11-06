# ADR 0021: Native controls and opaque Focus

## Status
Accepted

## Context
M09 needs global answer/capture actions and usable native pin/Focus without duplicating controller ownership or losing workbench state. The installed Electron31.7.7 runs on Ubuntu GNOME Wayland+XWayland. Its version-specific documentation warns that transparent windows conflict with resizing.

## Decision
Use a narrow typed preload interface with main-window/main-frame sender validation and boolean window-state mutations. Report independent shortcut registration outcomes and actual pin state. Native and focused-keyboard answer actions share the button's primary action; registered native handlers own their accelerators to avoid DOM duplicate delivery. Settings, dialogs and editable fields block background request actions. Alternate focused Alt+Shift+Enter/C shortcuts work even when another app owns the global accelerator. Plain Escape is never registered globally.

Use one existing opaque window. Focus hides the still-mounted raw/question panels and shows both answer columns near900px wide; it preserves the same WebSocket/controller and restores bounded window geometry/maximization when leaving. Pin window is a separate native action. Start each process unpinned and outside Focus; normal saved generation/audio/layout preferences are unchanged. Browser preview permits Focus layout but disables native pinning.

## Alternatives considered
- A second transparent Focus renderer adds state synchronization and ownership risk; deferred.
- A transparent resizable main window conflicts with Electron31's documented limits; rejected for this build.
- Whole-window opacity fades glyphs and is ineffective on Linux; rejected.

Capture is single-flight. Multi-screen capture matches the primary display ID; on Wayland, a sole ID-less consent-selected screen is accepted, with an instruction to select only the main screen. Ambiguous source selection is rejected rather than falling back to another display.

## Consequences
The functional opaque baseline ships without an Electron upgrade. Native translucency is explicitly unavailable; no CSS blur is represented as desktop blur. Shortcut failures retain visible controls and focused-keyboard fallbacks. Native acceptance remains separate from mocked/DOM tests. DevTools opens only with explicit `OPEN_DEVTOOLS=1`, allowing native checks with it closed.

Reference: [Electron31.7.7 window customization](https://github.com/electron/electron/blob/v31.7.7/docs/tutorial/window-customization.md#limitations), [globalShortcut](https://github.com/electron/electron/blob/v31.7.7/docs/api/global-shortcut.md).

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWindowChange = validateWindowChange;
exports.validateNativeSender = validateNativeSender;
exports.selectPrimaryScreen = selectPrimaryScreen;
function validateWindowChange(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid window state');
    const entries = Object.entries(value);
    if (!entries.length || entries.some(([key, item]) => !['pinned', 'focus'].includes(key) || typeof item !== 'boolean'))
        throw new Error('Invalid window state');
    return value;
}
function validateNativeSender(event, win) {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
        throw new Error('Untrusted IPC sender');
}
// Source order is not display identity, especially with multiple monitors/portals.
function selectPrimaryScreen(sources, primaryId, portalSelection = false) {
    const source = sources.find(item => item.display_id === primaryId);
    if (source)
        return source;
    // Electron31's PipeWire delegated chooser returns one user-approved source,
    // possibly without a display ID. This is consent selection, not array order.
    if (portalSelection && sources.length === 1 && sources[0].display_id === '')
        return sources[0];
    throw new Error('The approved primary display is unavailable for capture. Choose only your main screen in the system sharing dialog.');
}

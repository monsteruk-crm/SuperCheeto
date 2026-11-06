"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowState = void 0;
class WindowState {
    constructor(win, workArea) {
        this.win = win;
        this.workArea = workArea;
        this.focus = false;
        this.restore = null;
    }
    read(shortcuts) {
        return { pinned: this.win.isAlwaysOnTop(), focus: this.focus, shortcuts: { ...shortcuts }, transparency: { supported: false, reason: 'Opaque window: Electron 31 transparent windows conflict with resizing; native translucency is unavailable in this build.' } };
    }
    apply(change) {
        if (change.focus !== undefined && change.focus !== this.focus) {
            if (this.win.isFullScreen())
                throw new Error('Leave full screen before changing Focus mode.');
            if (change.focus) {
                this.restore = { bounds: this.win.getBounds(), maximized: this.win.isMaximized() };
                if (this.restore.maximized)
                    this.win.unmaximize();
                const area = this.workArea(this.restore.bounds);
                const width = Math.min(900, area.width), height = Math.min(800, area.height);
                this.win.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height });
            }
            else if (this.restore) {
                const old = this.restore.bounds, area = this.workArea(old);
                const width = Math.min(old.width, area.width), height = Math.min(old.height, area.height);
                this.win.setBounds({ width, height, x: Math.max(area.x, Math.min(old.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(old.y, area.y + area.height - height)) });
                if (this.restore.maximized)
                    this.win.maximize();
                this.restore = null;
            }
            this.focus = change.focus;
        }
        if (change.pinned !== undefined)
            this.win.setAlwaysOnTop(change.pinned);
    }
}
exports.WindowState = WindowState;

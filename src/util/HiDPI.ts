// Etapa 1 of the HiDPI plan (see session notes) — reads and caches the
// effective devicePixelRatio, capped for performance. Nothing in game.ts
// or any scene consumes this yet; canvas.width, the renderer, and every
// camera stay exactly as they are today.

// Capped at 2 rather than passing through raw devicePixelRatio (which can
// be 3-4 on high-end phones): backing-store pixel count grows with the
// SQUARE of this factor (width * height), so dpr=3 vs dpr=2 is already
// 2.25x more canvas memory and fragment-shader work for a visual gain
// past dpr=2 that's barely perceptible at typical coin/text sizes on a
// phone screen. 2 is also the ubiquitous "retina" baseline every relevant
// device already clears, so it captures the actual sharpness complaint
// without paying for the rare 3x/4x panels.
const MAX_DEVICE_PIXEL_RATIO = 2;

export const DEVICE_PIXEL_RATIO_REGISTRY_KEY = 'devicePixelRatio';

// window.devicePixelRatio is occasionally 0 or undefined in embedded/
// automated contexts (e.g. some headless or webview environments) —
// falling back to 1 there keeps the multiplier a no-op instead of
// producing a 0-sized or NaN-sized canvas downstream.
export function getEffectiveDevicePixelRatio(): number {
    const raw = window.devicePixelRatio || 1;
    return Math.min(raw, MAX_DEVICE_PIXEL_RATIO);
}

// Caches the current effective DPR on the game's registry so every scene
// reads the exact same value (computed once per resize here) instead of
// each re-deriving and possibly disagreeing after a live DPR change
// (e.g. dragging the window between two monitors with different scaling).
export function cacheDevicePixelRatio(game: Phaser.Game): void {
    game.registry.set(
        DEVICE_PIXEL_RATIO_REGISTRY_KEY,
        getEffectiveDevicePixelRatio()
    );
}

// Etapa 2 of the HiDPI plan — makes the canvas's actual backing store
// (canvas.width/height, what the renderer draws into) `dpr` times denser
// than its CSS/logical size, WITHOUT touching `scale.width`/`scale.height`
// (== ScaleManager.gameSize), which every existing layout/camera formula
// (PLAY_AREA_WIDTH, updateCameraFit(), HUD positioning) keeps reading
// completely unchanged.
//
// Phaser's RESIZE mode normally forces `baseSize` (what actually drives
// canvas.width/height, every camera's auto-tracked size via
// CameraManager.onResize, and the pointer.x/y transform via
// `displayScale = baseSize / canvasBounds`) to equal `gameSize` on every
// resize. Deliberately breaking that equality — baseSize bigger,
// gameSize untouched — is what makes every camera and pointer.x/y
// automatically cascade to the denser backing store with zero manual
// per-call-site coordinate patching: pointer.x/y come out already scaled
// by `dpr` (matching what MainScene's getWorldPoint-based drop math and
// Phaser's own internal button hit-testing both need), while
// `scale.width/height` stay exactly as they were.
//
// This must run *after* Phaser's own ScaleManager.updateScale() has
// already set canvas.width/baseSize back to the logical size for this
// resize cycle (true for any 'resize' listener, since that assignment
// happens synchronously before the event is emitted — see
// ScaleManager.refresh()/updateScale() in phaser/src/scale/ScaleManager.js)
// so this override isn't immediately clobbered.
// Last known-good backing-store size, re-asserted whenever a 0x0 resize
// comes in (see applyHiDPIBackingStore() below) — a plain early-return
// wouldn't be enough here, because by the time this function is called,
// Phaser's own ScaleManager.updateScale() has *already* set
// canvas.width/height/baseSize to 0 for this cycle (that assignment
// happens synchronously inside refresh(), before the 'resize' event —
// and therefore this listener — fires). Skipping our own work would just
// leave Phaser's own zeroed-out values in place; actively re-applying the
// last good size is what actually keeps the canvas from collapsing.
let lastGoodBackingWidth = 0;
let lastGoodBackingHeight = 0;
let lastGoodLogicalWidth = 0;
let lastGoodLogicalHeight = 0;

export function applyHiDPIBackingStore(game: Phaser.Game): void {
    const scaleManager = game.scale;
    const logicalWidth = scaleManager.gameSize.width;
    const logicalHeight = scaleManager.gameSize.height;

    // A 0x0 resize isn't a real size change — it happens whenever #content
    // (Phaser's RESIZE-mode parent element) momentarily loses its layout
    // box, e.g. index.html's Ajustes panel setting the game pane's
    // ancestor to display:none. Applying the backing-store math to 0
    // would collapse canvas.width/height/baseSize to 0 and, downstream,
    // every camera's zoom/size to a degenerate value (confirmed live:
    // MainScene's camera zoom bottomed out at Phaser's internal 0.001
    // floor) — all of which then has to visibly snap back once the real
    // size reappears. A 0-sized #content is never the real, final size
    // the user is looking at, so instead of applying it, re-assert the
    // last known-good backing-store state — canvas/baseSize/displayScale
    // stay exactly as they were the moment before the collapse, for as
    // long as it lasts.
    if (logicalWidth === 0 || logicalHeight === 0) {
        if (lastGoodBackingWidth === 0) {
            // Nothing has ever succeeded yet (e.g. Ajustes opened before
            // the very first real layout pass) — there's no known-good
            // state to restore, so there's genuinely nothing to do.
            return;
        }
        scaleManager.baseSize.resize(lastGoodBackingWidth, lastGoodBackingHeight);
        game.canvas.width = lastGoodBackingWidth;
        game.canvas.height = lastGoodBackingHeight;
        game.canvas.style.width = `${lastGoodLogicalWidth}px`;
        game.canvas.style.height = `${lastGoodLogicalHeight}px`;
        game.renderer.resize(lastGoodBackingWidth, lastGoodBackingHeight);
        scaleManager.displayScale.set(
            lastGoodBackingWidth / lastGoodLogicalWidth,
            lastGoodBackingHeight / lastGoodLogicalHeight
        );
        return;
    }

    const dpr = getEffectiveDevicePixelRatio();
    const backingWidth = Math.round(logicalWidth * dpr);
    const backingHeight = Math.round(logicalHeight * dpr);
    lastGoodBackingWidth = backingWidth;
    lastGoodBackingHeight = backingHeight;
    lastGoodLogicalWidth = logicalWidth;
    lastGoodLogicalHeight = logicalHeight;

    // baseSize drives canvas.width/height assignment elsewhere in Phaser's
    // own code (e.g. CameraManager's auto-track, which cameras that never
    // call setSize themselves — HUDScene/MenuScene/DebugScene, still on
    // Etapa 1's plain zoom=1 — rely on) and the pointer transform ratio;
    // gameSize is left alone on purpose (see comment above).
    scaleManager.baseSize.resize(backingWidth, backingHeight);

    const canvas = game.canvas;
    canvas.width = backingWidth;
    canvas.height = backingHeight;
    // RESIZE mode never writes canvas.style.width/height itself (confirmed
    // reading ScaleManager.updateScale()'s RESIZE branch — only NONE and
    // the "everything else" branch do), so re-pinning it here to the
    // logical size is safe: nothing else is fighting for control of it,
    // and without this the browser would otherwise size the canvas's CSS
    // box from its own intrinsic width/height attributes (now dpr times
    // too big), stretching the whole page layout instead of just
    // increasing pixel density.
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;

    // Keeps the WebGL projection matrix and gl.viewport in sync with the
    // new backing store — without this, cameras would only paint into the
    // top-left logical-sized corner of the now-larger canvas (this is
    // exactly the "tiny cropped fragment" failure from the earlier
    // reverted HiDPI attempt, which resized the canvas but never got this
    // far into reconciling camera/renderer state with it).
    game.renderer.resize(backingWidth, backingHeight);

    // ScaleManager.refresh() computes `displayScale = baseSize / canvasBounds`
    // — the exact ratio Phaser's InputManager uses to turn a raw page
    // click into `pointer.x/y` — but it does so *before* emitting the
    // 'resize' event this function runs from, using whatever baseSize
    // Phaser's own updateScale() had just set (the logical size, since
    // our override above hasn't happened yet at that point in the cycle).
    // Left alone, displayScale silently stays at its pre-override ratio
    // (~1) until the next real 'resize' event happens to fire — which on
    // a static viewport may be never — so pointer.x/y would keep arriving
    // in logical/CSS units while every camera (sized to the new backing
    // store above) expects backing-store units, breaking
    // getWorldPoint()-based drop placement and Phaser's own internal
    // button hit-testing alike. Recomputing it here, immediately, closes
    // that gap: canvasBounds is still the CSS box (canvas.style was just
    // pinned to logicalWidth/Height above), so baseSize/canvasBounds
    // reduces to exactly `dpr`.
    scaleManager.displayScale.set(dpr, dpr);
}

// Etapa 3 of the HiDPI plan — for scenes whose camera has no "cover" fit
// of its own (HUDScene, MenuScene, DebugScene: all plain zoom=1,
// screen-space UI cameras, unlike MainScene's custom updateCameraFit()).
// Shared here instead of duplicated per scene on purpose — Etapa 2's
// checkpoint found two real, subtle bugs (camera width silently staying
// at the stale logical size across a scene restart; displayScale going
// stale for an entire resize cycle) that only surfaced under specific
// timing, exactly the kind of thing that's easy to fix in one call site
// and then accidentally do slightly differently in the next three.
//
// setSize() is explicit (not left to CameraManager's auto-track) for the
// same reason MainScene.updateCameraFit() now does it explicitly: the
// auto-track only fires when a camera's current width happens to exactly
// equal the game's *previous* logical width, which isn't reliably true
// across a scene stop/start cycle (see updateCameraFit()'s comment for
// the full trace of how that broke drop placement in Etapa 2).
export function applyUniformDPRCameraFit(scene: Phaser.Scene): void {
    // Same 0x0-during-Ajustes guard as applyHiDPIBackingStore() — unlike
    // that function, a plain skip is enough here (no "re-apply the last
    // good value" needed): this camera's width is always dpr-multiplied
    // and therefore never equal to Phaser's own CameraManager.onResize
    // auto-track condition (cam._width === the game's previous logical
    // width), so nothing else in Phaser's pipeline touches this camera
    // when we simply don't call setSize/setZoom/centerOn — it just keeps
    // whatever it was already correctly set to.
    if (scene.scale.width === 0 || scene.scale.height === 0) {
        return;
    }
    const dpr =
        scene.registry.get(DEVICE_PIXEL_RATIO_REGISTRY_KEY) || 1;
    const camera = scene.cameras.main;
    camera.setSize(scene.scale.width * dpr, scene.scale.height * dpr);
    camera.setZoom(dpr);
    camera.centerOn(scene.scale.width / 2, scene.scale.height / 2);
}

// Etapa 3 follow-up — camera zoom (above) only sharpens texture-based
// GameObjects (sprites, baked Graphics fills); Phaser.GameObjects.Text
// renders to its OWN internal canvas at a resolution controlled by
// `style.resolution`, entirely independent of camera zoom. The docs for
// that property claim an unset value (0) "will use the resolution set in
// the Game Config" — false in this Phaser version: Text's own constructor
// (phaser/src/gameobjects/text/Text.js) unconditionally hardcodes it to 1
// whenever it's 0, never reading game.config.resolution at all. So
// setting a top-level `resolution` in the Game Config (the other option
// considered) would silently do nothing — confirmed by reading that
// source directly rather than trusting the stale doc comment. The only
// thing that actually works is calling setResolution() per Text instance.
//
// Sweeping every current Text child instead of passing `resolution: dpr`
// in each individual style object at creation: HUDScene/MenuScene create
// well over a dozen Text objects across create() and several
// destroy+rebuild cycles (pause overlay, game-over overlay, how-to-play
// panel), and a per-call-site edit risks silently missing one — exactly
// the class of subtle miss this whole plan has been trying to design
// around. setResolution() is cheap and idempotent (only regenerates the
// text's bitmap, doesn't touch position/content), so calling it
// unconditionally on everything currently in the scene, every time this
// runs, is simpler than tracking which Text objects are "new" this cycle.
export function applyDPRToAllText(scene: Phaser.Scene): void {
    const dpr =
        scene.registry.get(DEVICE_PIXEL_RATIO_REGISTRY_KEY) || 1;
    scene.children.list.forEach((child) => {
        if (child instanceof Phaser.GameObjects.Text) {
            child.setResolution(dpr);
        }
    });
}

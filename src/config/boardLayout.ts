// Playable board geometry. The physical rectangle where orbs actually fall,
// merge, and stack stays a fixed 580x800 regardless of the decorative jar
// artwork framing it — only the surrounding canvas grows to make room for
// the jar's neck (above) and rounded base (below). Keeping these numbers
// here (instead of scattered across MainScene.ts/HUDScene.ts/game.ts) means
// there's one place to nudge when the real jar art gets tuned.
export const PLAY_AREA_WIDTH = 580;
export const PLAY_AREA_HEIGHT = 800;

// Height of the opaque HUD header strip (HUDScene's backdrop fillRect,
// score/record text + "Siguiente" panel). The jar is drawn starting at this
// Y (see MainScene.create()) so the header doesn't paint over its neck.
export const HEADER_HEIGHT = 90;

// Neck + shoulder height of assets/jar/frasco1_transparent.png's cropped
// 'body' frame, at NATIVE resolution — Phaser's NineSlice renders
// topHeight/bottomHeight unscaled regardless of the object's overall
// width/height (see MainScene.ts's JAR_NECK_HEIGHT_NATIVE, kept in sync
// manually since that constant lives with the rest of the jar-cropping
// math, not here).
const JAR_NECK_HEIGHT = 232;

// PLAY_AREA_TOP_OFFSET now == header + full neck, so the physics/play
// rectangle starts exactly where the jar's straight body begins — the neck
// has room to render completely below the header instead of being clipped
// by it.
export const PLAY_AREA_TOP_OFFSET = HEADER_HEIGHT + JAR_NECK_HEIGHT; // 322
export const PLAY_AREA_BOTTOM_PADDING = 70;

export const CANVAS_WIDTH = PLAY_AREA_WIDTH;
export const CANVAS_HEIGHT =
    PLAY_AREA_TOP_OFFSET + PLAY_AREA_HEIGHT + PLAY_AREA_BOTTOM_PADDING;

// Vertical center of the actual play rectangle — NOT the same as the whole
// canvas's center, since the jar's neck/base padding isn't symmetric.
// cameras.main.centerY or game.config.height / 2 would sit off-center
// relative to where gameplay actually happens.
export const PLAY_AREA_CENTER_Y = PLAY_AREA_TOP_OFFSET + PLAY_AREA_HEIGHT / 2;

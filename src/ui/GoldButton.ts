// Shared visual language for every Phaser-rendered button and heading in
// the game — MenuScene's buttons and HUDScene's pause overlay buttons used
// to be two near-duplicate implementations (one gradient, one flat) that
// could easily drift apart. Centralizing them here means one place to
// tune the "antique gold coin/glass" look: a soft gradient, a thin bronze
// border, and a bright top edge standing in for a beveled metal/glass
// surface, instead of the flat orange/amber rectangles this replaced.
export const GOLD_FILL_TOP = 0xf5cd85;
export const GOLD_FILL_BOTTOM = 0x96692f;
export const GOLD_BORDER = 0x6b4423;
export const GOLD_TEXT_COLOR = '#3a1f0a';
export const GOLD_BEVEL_HIGHLIGHT = 0xfff6dc;

// Warm dark brown used behind panels (the pause overlay, the "Siguiente"
// preview) instead of the old cool navy fill + violet stroke — keeps every
// dark surface in the same amber-toned family as the buttons above it.
export const PANEL_BG = 0x2b1c10;
export const PANEL_BORDER = 0x8a5a2b;

// Loaded via index.html's Google Fonts <link> (see game.ts's
// document.fonts.ready gate, which waits for it before the first Phaser
// Text is ever created) — no font files shipped with the bundle. Falls
// back to a generic sans instead of a serif if the font ever fails to
// load, since a serif fallback would look tonally unrelated to Baloo 2's
// rounded style.
export const GAME_FONT_FAMILY = "'Baloo 2', sans-serif";

export function createGoldButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    fontSize: string,
    onClick: () => void
): [Phaser.GameObjects.Graphics, Phaser.GameObjects.Text] {
    const left = x - width / 2;
    const top = y - height / 2;

    const background = scene.add.graphics();
    background.fillGradientStyle(
        GOLD_FILL_TOP,
        GOLD_FILL_TOP,
        GOLD_FILL_BOTTOM,
        GOLD_FILL_BOTTOM,
        1
    );
    background.fillRect(left, top, width, height);
    // Thin bright line along the top edge only — reads as a highlight
    // catching the light, the cheapest approximation of a beveled/glassy
    // surface without a second gradient or a shader.
    background.fillStyle(GOLD_BEVEL_HIGHLIGHT, 0.8);
    background.fillRect(left, top, width, 2);
    background.lineStyle(2, GOLD_BORDER, 1);
    background.strokeRect(left, top, width, height);

    background.setInteractive(
        new Phaser.Geom.Rectangle(left, top, width, height),
        Phaser.Geom.Rectangle.Contains
    );
    background.input.cursor = 'pointer';
    background.on('pointerdown', onClick);

    const text = scene.add.text(x, y, label, {
        fontFamily: GAME_FONT_FAMILY,
        // Explicit, not just relying on font-matching to substitute a
        // nearby weight: Canvas 2D text (what Phaser draws through, even
        // under WebGL) doesn't do the same graceful weight substitution
        // browsers do for DOM/CSS text — an exact family+weight match is
        // what actually gets requested from the browser's loaded font set.
        fontStyle: 'bold',
        fontSize,
        color: GOLD_TEXT_COLOR,
    });
    text.setOrigin(0.5);

    return [background, text];
}

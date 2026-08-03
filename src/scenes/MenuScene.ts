import { CANVAS_WIDTH } from '../config/boardLayout';
import { renderDialog, createDialogContentFromTemplate } from '../page';
import { loadBgm, getOrCreateBgm, playBgmIfNeeded } from '../managers/Bgm';
import { createGoldButton, GAME_FONT_FAMILY } from '../ui/GoldButton';

const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 64;

// assets/img/menu_jar.png's canvas is 1600x2656 (re-extracted via rembg/
// isnet-general-use against a dark-shelf source photo, replacing the old
// 388x644 file). Re-measured (alpha-scan, threshold alpha>10 to ignore a
// handful of stray alpha=1 noise pixels the model left at the four
// corners): the jar illustration occupies a 1278x2251 box within it, with
// a transparent margin on each side left over from the export. These 4
// numbers must stay in sync with whatever the current file's real content
// box is — hardcoding them against a previous file's crop is exactly what
// made the jar render as a narrow sliver after the image was swapped once
// already.
const MENU_JAR_CONTENT_LEFT = 160;
const MENU_JAR_CONTENT_TOP = 230;
const MENU_JAR_CONTENT_WIDTH = 1278;
const MENU_JAR_CONTENT_HEIGHT = 2251;

export class MenuScene extends Phaser.Scene {
    private bgm: Phaser.Sound.BaseSound;

    constructor() {
        super({
            key: 'MenuScene',
        });
    }

    preload(): void {
        this.load.image('menuJar', './assets/img/menu_jar.png');
        loadBgm(this);
    }

    create(): void {
        const centerX = CANVAS_WIDTH / 2;

        // Help/settings icons are redundant here (this scene's own
        // "Configuración" button covers the same ground) — hidden via
        // index.css's `body.menu-active` rule. MainScene.create() removes
        // this class, so they're back for actual gameplay, where there's no
        // other way to reach them.
        document.body.classList.add('menu-active');

        // Created here (safe — no playback yet) so it's ready the instant
        // the first button click fires; MainScene reuses this same instance
        // via getOrCreateBgm instead of creating a second one.
        this.bgm = getOrCreateBgm(this);

        // No background image/rect here — the game canvas is transparent
        // (see game.ts) so index.css's body backdrop photo already shows
        // through behind this scene, same as it does around the jar during
        // gameplay.

        this.textures.get('menuJar').add(
            'content',
            0,
            MENU_JAR_CONTENT_LEFT,
            MENU_JAR_CONTENT_TOP,
            MENU_JAR_CONTENT_WIDTH,
            MENU_JAR_CONTENT_HEIGHT
        );

        // Width matches PLAY_AREA_WIDTH exactly — same as the real gameplay
        // jar's NineSlice (MainScene.ts: `add.nineslice(..., PLAY_AREA_WIDTH,
        // jarHeight, ...)`), which is CANVAS_WIDTH here (same value, see
        // boardLayout.ts). Same scale means no visual size jump when "Jugar"
        // hands off to MainScene. Height then just follows this asset's own
        // aspect ratio (it's a flat illustration, not built with separate
        // neck/base regions, so there's no real NineSlice to reuse here —
        // uniform scaling is the closest equivalent).
        const jarWidth = CANVAS_WIDTH;
        const jarHeight =
            jarWidth * (MENU_JAR_CONTENT_HEIGHT / MENU_JAR_CONTENT_WIDTH);

        // At full width the jar is tall enough (~86% of CANVAS_HEIGHT, fixed
        // by this asset's own aspect ratio) that there's very little room
        // left above it. Help/settings are hidden on this scene now (see
        // the menu-active class above), leaving only the small mute icon up
        // top — nowhere near as wide as the old 3-icon row — so the title
        // only needs to clear that one small icon, not a whole row.
        const titleY = 60;
        const titleFontSize = 36;

        this.add
            .text(centerX, titleY, 'Fusioná Monedas', {
                fontFamily: GAME_FONT_FAMILY,
                // Explicit, not left to font-matching substitution — see
                // GoldButton.ts's createGoldButton for why Canvas 2D text
                // needs an exact family+weight match.
                fontStyle: 'bold',
                fontSize: `${titleFontSize}px`,
                color: '#fff5d6',
                stroke: '#3a1f0a',
                strokeThickness: 5,
                align: 'center',
            })
            .setOrigin(0.5);

        const jarTop = titleY + titleFontSize * 0.6 + 20;
        const jarCenterY = jarTop + jarHeight / 2;

        const jarImage = this.add.image(
            centerX,
            jarCenterY,
            'menuJar',
            'content'
        );
        jarImage.setDisplaySize(jarWidth, jarHeight);

        // Buttons sit inside the jar's empty glass, above the coin pile.
        // Found that boundary by scanning menu_jar.png for where saturated
        // (multi-hue) pixels start showing up row-by-row — glass/neck are
        // uniformly amber, the coins are what introduce green/blue/purple/
        // silver — and it lands around 55% down the content crop. Button Ys
        // below are comfortably above that line (jarTop + ~0.32 and ~0.45
        // of jarHeight), clear of both the neck above and the coins below.
        this.createButton(centerX, jarTop + jarHeight * 0.32, 'Jugar', () => {
            playBgmIfNeeded(this.bgm);
            this.scene.start('MainScene');
        });

        this.createButton(
            centerX,
            jarTop + jarHeight * 0.45,
            'Configuración',
            () => {
                playBgmIfNeeded(this.bgm);
                renderDialog(
                    createDialogContentFromTemplate('#how-to-play'),
                    true
                );
            }
        );
    }

    private createButton(
        x: number,
        y: number,
        label: string,
        onClick: () => void
    ): void {
        createGoldButton(
            this,
            x,
            y,
            BUTTON_WIDTH,
            BUTTON_HEIGHT,
            label,
            '28px',
            onClick
        );
    }
}

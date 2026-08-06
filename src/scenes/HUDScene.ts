import { OrbTier, fruitTypeToTextureString } from '../gameobjects/Fruit';
import { SUPERNOVA_CHAIN_BONUS } from './MainScene';
import {
    PLAY_AREA_CENTER_Y,
    PLAY_AREA_TOP_OFFSET,
    CANVAS_WIDTH,
} from '../config/boardLayout';
import {
    createGoldButton,
    GAME_FONT_FAMILY,
    GOLD_FILL_TOP,
    PANEL_BG,
    PANEL_BORDER,
} from '../ui/GoldButton';
import { t, onLanguageChanged, offLanguageChanged } from '../i18n';

const GAME_OVER_SCREEN_OFFSET: number = -200;
const NEXT_ORB_PREVIEW_SIZE: number = 64;

const PAUSE_ICON_RADIUS = 20;
const PAUSE_OVERLAY_BACKDROP_ALPHA = 0.65;
const PAUSE_PANEL_WIDTH = 320;
const PAUSE_PANEL_HEIGHT = 230;
const PAUSE_BUTTON_WIDTH = 240;
const PAUSE_BUTTON_HEIGHT = 56;

// "Luxury watch face" styling for the score/record readout: normal
// (non-bold) weight, dark bronze — reads as a label printed directly on
// the game background rather than the cream/gold fill this used to have,
// which needed a stroke just to stay legible; a dark fill has enough
// contrast on its own, so no stroke here.
const HUD_SCORE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: GAME_FONT_FAMILY,
    fontStyle: 'normal',
    color: '#3a1f0a',
};

// Every one of these texts (score/record, game-over, new-record, win,
// chain-reaction, the tap-to-play instruction) floats freely over the
// jar/board — none of them live inside a fixed-real-px container the way
// nextFruitText (an 80px-wide panel) or pauseTitleText (a 320px-wide
// dialog) do, so scaling them with the screen is safe and correct: no
// fixed box for them to overflow.
//
// Under Scale.FIT, a literal e.g. 16px fontSize was safe because the
// canvas's logical resolution was pinned at a constant 580-wide
// (CANVAS_WIDTH) regardless of device, and Scale.FIT's own CSS transform
// scaled the whole rendered frame — text included — up/down to fit each
// screen. 16px was always 16/580 of the canvas width, on every device.
// Scale.RESIZE removes that global compensation: the canvas *is* the real
// device resolution now, so a literal 16px reads as an increasingly large
// fraction of the screen the narrower the device gets — this is what made
// these texts look oversized on mobile. Re-deriving fontSize from
// this.scale.width against the same 580-wide reference restores the
// original on-screen proportion on any device, clamped so it can't shrink
// to illegible on a tiny phone or balloon up on a wide desktop monitor.
const HUD_TEXT_SCALE_REFERENCE_WIDTH = CANVAS_WIDTH;

// Phaser 3.60's canvas Text object has no letterSpacing style property
// (only BitmapText does), so the "let the numbers breathe" spacing is faked
// by joining characters with a thin space glyph.
const HUD_LETTER_SPACER = ' ';
function withLetterSpacing(value: string): string {
    return value.split('').join(HUD_LETTER_SPACER);
}

export class HUDScene extends Phaser.Scene {
    private mainScene: Phaser.Scene;

    private scoreLabelText: Phaser.GameObjects.Text;
    private highScoreLabelText: Phaser.GameObjects.Text;
    private scoreText: Phaser.GameObjects.Text;
    private highscoreText: Phaser.GameObjects.Text;
    private score: number;
    private highscore: number = 0;

    private gameOverText: Phaser.GameObjects.Text;
    private beatHighscoreText: Phaser.GameObjects.Text;
    private winText: Phaser.GameObjects.Text;
    private instructionText: Phaser.GameObjects.Text;
    private fingerIcon: Phaser.GameObjects.Image;
    private leftArrow: Phaser.GameObjects.Image;
    private rightArrow: Phaser.GameObjects.Image;

    private nextFruitGlow: Phaser.GameObjects.Rectangle;
    private nextFruitBack: Phaser.GameObjects.Rectangle;
    private nextFruitText: Phaser.GameObjects.Text;
    private nextFruitSprite: Phaser.GameObjects.Sprite;

    private chainReactionText: Phaser.GameObjects.Text;

    private pauseIcon: Phaser.GameObjects.Graphics;
    private pauseOverlayElements: (
        | Phaser.GameObjects.Rectangle
        | Phaser.GameObjects.Graphics
        | Phaser.GameObjects.Text
    )[];
    private pauseTitleText: Phaser.GameObjects.Text;
    private pauseResumeButtonText: Phaser.GameObjects.Text;
    private pauseMenuButtonText: Phaser.GameObjects.Text;

    // Same reasoning as MainScene.ts's boundOnControlsChange — this.game.
    // events is global and outlives this scene, so the exact function
    // reference needs to survive to be .off()'d on shutdown.
    private boundOnControlsChange = this.onControlsChange.bind(this);
    private boundOnLanguageChanged = this.updateTranslatedTexts.bind(this);
    // RESIZE migration, stage 2 — placeholder only (see MainScene.ts's
    // boundOnResize for the full rationale). this.scale is the Game-wide
    // ScaleManager, same lifecycle concern as boundOnControlsChange above.
    private boundOnResize = this.onResize.bind(this);

    constructor() {
        super({
            key: 'HUDScene',
        });
    }

    preload(): void {
        this.load.image('fingerIcon', './assets/img/tap.png');
        this.load.image('leftArrow', './assets/img/LeftArrow.svg');
        this.load.image('rightArrow', './assets/img/RightArrow.svg');
    }

    create(): void {
        // 16px is this text's original, implicit Phaser default (no
        // fontSize was ever set here) — see HUD_TEXT_SCALE_REFERENCE_WIDTH's
        // comment for why that stopped being safe under Scale.RESIZE.
        // 11/20 keeps it legible on the narrowest phones this game
        // realistically targets without ballooning past its original size
        // on a wide desktop monitor.
        const scoreFontSize = this.scaledFontSize(16, 11, 20);
        this.scoreLabelText = this.add.text(
            10,
            10,
            withLetterSpacing(t('hud.score')),
            { ...HUD_SCORE_TEXT_STYLE, fontSize: `${scoreFontSize}px` }
        );
        this.scoreText = this.add.text(
            120,
            10,
            withLetterSpacing('0'),
            { ...HUD_SCORE_TEXT_STYLE, fontSize: `${scoreFontSize}px` }
        );
        this.highScoreLabelText = this.add.text(
            10,
            30,
            withLetterSpacing(t('hud.highScore')),
            { ...HUD_SCORE_TEXT_STYLE, fontSize: `${scoreFontSize}px` }
        );
        this.highscoreText = this.add.text(
            120,
            30,
            withLetterSpacing('0'),
            { ...HUD_SCORE_TEXT_STYLE, fontSize: `${scoreFontSize}px` }
        );
        if (this.registry.get('highscore')) {
            this.highscore = this.registry.get('highscore');
            this.highscoreText.setText(
                withLetterSpacing(this.highscore.toString())
            );
        }

        this.score = 0;

        this.mainScene = this.scene.get('MainScene');
        this.mainScene.events.on('updateScore', this.updateScore.bind(this));
        this.mainScene.events.on('gameOver', this.gameOver.bind(this));
        this.mainScene.events.on('gameStarted', this.onGameStarted.bind(this));
        this.mainScene.events.on('gameInit', this.onGameInit.bind(this));
        this.mainScene.events.on('tap', this.onTap.bind(this));
        this.mainScene.events.on('win', this.onWin.bind(this));
        this.mainScene.events.on(
            'nextFruit',
            this.setNextFruitSprite.bind(this)
        );
        this.mainScene.events.on(
            'supernovaChainReaction',
            this.onSupernovaChainReaction.bind(this)
        );
        this.mainScene.events.on('toggleHUD', () => {
            const isVisible = this.scene.isVisible('HUDScene');
            this.scene.setVisible(!isVisible, 'HUDScene');
        });

        this.game.events.on('controlsChange', this.boundOnControlsChange);
        this.scale.on('resize', this.boundOnResize);

        // Mirrors DebugScene.ts's own 'shutdown' listener pattern (see its
        // create()) — same idea, applied to the one thing *this* scene
        // registers on an emitter that outlives it. HUDScene's *other*
        // cross-scene listeners (all the this.mainScene.events.on(...)
        // calls above) don't need the same treatment: they live on
        // MainScene's own emitter, and MainScene's returnToMenu() already
        // wipes that whole emitter via removeAllListeners() when it stops.
        this.events.on('shutdown', () => {
            this.game.events.off('controlsChange', this.boundOnControlsChange);
            this.scale.off('resize', this.boundOnResize);
        });

        // Same implicit-16px story as scoreFontSize above.
        const messageFontSize = this.scaledFontSize(16, 11, 22);
        this.gameOverText = this.add.text(
            this.scale.width / 4,
            PLAY_AREA_CENTER_Y + GAME_OVER_SCREEN_OFFSET,
            t('hud.gameOver'),
            { fontFamily: GAME_FONT_FAMILY, fontSize: `${messageFontSize}px` }
        );
        this.gameOverText.setVisible(false);
        this.beatHighscoreText = this.add.text(
            this.scale.width / 4,
            PLAY_AREA_CENTER_Y + 50 + GAME_OVER_SCREEN_OFFSET,
            t('hud.newRecord'),
            { fontFamily: GAME_FONT_FAMILY, fontSize: `${messageFontSize}px` }
        );
        this.beatHighscoreText.setVisible(false);
        this.winText = this.add.text(
            this.scale.width / 4,
            PLAY_AREA_CENTER_Y + GAME_OVER_SCREEN_OFFSET,
            t('hud.win'),
            { fontFamily: GAME_FONT_FAMILY, fontSize: `${messageFontSize}px` }
        );
        this.winText.setVisible(false);

        this.chainReactionText = this.add.text(
            0,
            0,
            t('hud.chainReaction', { points: SUPERNOVA_CHAIN_BONUS }),
            { fontFamily: GAME_FONT_FAMILY, fontSize: `${messageFontSize}px` }
        );
        this.chainReactionText.setOrigin(0.5);
        this.chainReactionText.setVisible(false);

        // Add the instruction text — 24px was this one's explicit original
        // base (not the implicit 16px default the others above share).
        this.instructionText = this.add.text(
            this.scale.width / 2,
            PLAY_AREA_CENTER_Y - 50,
            t('hud.tapToPlay'),
            {
                fontFamily: GAME_FONT_FAMILY,
                fontSize: `${this.scaledFontSize(24, 16, 30)}px`,
                align: 'center',
            }
        );
        this.instructionText.setOrigin(0.5);
        this.instructionText.setVisible(false);

        // Add the finger icon
        this.fingerIcon = this.add.image(
            this.scale.width / 2,
            PLAY_AREA_CENTER_Y + 50,
            'fingerIcon'
        );
        this.fingerIcon.setOrigin(0.5);
        this.fingerIcon.setScale(0.2, 0.2);
        this.fingerIcon.setVisible(false);

        this.leftArrow = this.add.image(
            0,
            PLAY_AREA_CENTER_Y + 50,
            'leftArrow'
        );
        this.leftArrow.setOrigin(0.5);
        this.leftArrow.setScale(0.1, 0.1);
        this.leftArrow.x = this.leftArrow.displayWidth / 2;
        this.leftArrow.setInteractive();
        this.leftArrow.on('pointerdown', () => {
            this.mainScene.events.emit('moveLeftStart');
        });
        this.leftArrow.on('pointerup', () => {
            this.mainScene.events.emit('moveLeftStop');
        });
        this.leftArrow.on('pointerout', () => {
            this.mainScene.events.emit('moveLeftStop');
        });

        this.rightArrow = this.add.image(
            0,
            PLAY_AREA_CENTER_Y + 50,
            'rightArrow'
        );
        this.rightArrow.setOrigin(0.5);
        this.rightArrow.setScale(0.1, 0.1);
        this.rightArrow.x =
            this.scale.width - this.rightArrow.displayWidth / 2;
        this.rightArrow.setInteractive();
        this.rightArrow.on('pointerdown', () => {
            this.mainScene.events.emit('moveRightStart');
        });
        this.rightArrow.on('pointerup', () => {
            this.mainScene.events.emit('moveRightStop');
        });
        this.rightArrow.on('pointerout', () => {
            this.mainScene.events.emit('moveRightStop');
        });

        this.onControlsChange(gameOptions.controls);

        // Add the next orb backing glow — a soft halo in one of the orb tier
        // colors behind the panel, so it reads as part of the same palette
        // as the board instead of the old mismatched brown/orange box.
        // Sized/positioned to sit inside HEADER_HEIGHT (90) with breathing
        // room top and bottom, instead of hanging down into the jar's neck.
        this.nextFruitGlow = this.add.rectangle(
            this.scale.width - 40,
            44,
            96,
            96,
            GOLD_FILL_TOP,
            0.35
        );

        // VARIANT B — dark Pausa palette. Same PANEL_BG/PANEL_BORDER as
        // the pause overlay, but with a thicker border (3px, up from 2px)
        // than Pausa's own panel — a small panel like this one needs more
        // edge weight to read clearly against the jar's busy background
        // than a big full-screen panel does.
        this.nextFruitBack = this.add.rectangle(
            this.scale.width - 40,
            44,
            80,
            80,
            PANEL_BG
        );
        this.nextFruitBack.setStrokeStyle(3, PANEL_BORDER, 1);

        // Add the next orb text — 13px (down from 24px) so "Siguiente" fits
        // the 80px-wide panel; Phaser's default Courier font is monospace at
        // ~0.6em/char, so 24px (~130px wide) was overflowing both the panel
        // and the canvas edge, which is what was clipping it visually.
        this.nextFruitText = this.add.text(
            this.scale.width - 40,
            10,
            t('hud.next'),
            {
                fontFamily: GAME_FONT_FAMILY,
                fontSize: '13px',
                align: 'center',
                color: '#f3e2bc',
            }
        );
        this.nextFruitText.setOrigin(0.5);
        this.nextFruitText.setVisible(false);

        // Add the next fruit sprite
        this.nextFruitSprite = new Phaser.GameObjects.Sprite(
            this,
            this.scale.width - 40,
            52,
            `chispa_${gameOptions.theme}`
        );
        this.nextFruitSprite.setDisplaySize(
            NEXT_ORB_PREVIEW_SIZE,
            NEXT_ORB_PREVIEW_SIZE
        );
        this.nextFruitSprite.setVisible(false);
        this.add.existing(this.nextFruitSprite);

        // --- Pause button + pause overlay ---
        // Lives here (not MainScene) deliberately: MainScene gets fully
        // paused — frozen, but still rendering underneath — so it can't
        // run any of its own UI/input while the overlay is up. HUDScene
        // stays fully active throughout.
        const pauseIconY = 44; // same header row as the Siguiente panel

        // Drawn in LOCAL space (centered on the Graphics object's own
        // origin) instead of baking pauseIconX into every fillCircle/
        // fillRect call, specifically so a resize can just call
        // setPosition() below — the interactive hit Circle (see
        // enablePauseIcon()) is also defined in local (0, 0) space, so it
        // automatically follows the object's transform and never needs
        // recomputing either.
        this.pauseIcon = this.add.graphics();
        this.pauseIcon.fillStyle(PANEL_BG, 1);
        this.pauseIcon.fillCircle(0, 0, PAUSE_ICON_RADIUS);
        this.pauseIcon.lineStyle(2, PANEL_BORDER, 0.9);
        this.pauseIcon.strokeCircle(0, 0, PAUSE_ICON_RADIUS);
        this.pauseIcon.fillStyle(0xffffff, 1);
        this.pauseIcon.fillRect(-7, -9, 5, 18);
        this.pauseIcon.fillRect(2, -9, 5, 18);
        this.pauseIcon.setPosition(this.scale.width / 2, pauseIconY);
        this.enablePauseIcon();
        this.pauseIcon.on('pointerdown', () => this.openPauseOverlay());

        this.buildPauseOverlay();
        this.showPauseOverlay(false);

        onLanguageChanged(this.boundOnLanguageChanged);
        this.events.once('shutdown', () => {
            offLanguageChanged(this.boundOnLanguageChanged);
        });

        this.scene.bringToTop();
    }

    // Repaints every translated Text object in place — covers the case
    // where a first-time visitor's IP-based language detection resolves
    // *while* this scene is already showing (see i18n/index.ts). The
    // score/highscore *values* (scoreText/highscoreText) aren't touched —
    // they're numbers, not translated strings.
    private updateTranslatedTexts(): void {
        this.scoreLabelText.setText(withLetterSpacing(t('hud.score')));
        this.highScoreLabelText.setText(withLetterSpacing(t('hud.highScore')));
        this.gameOverText.setText(t('hud.gameOver'));
        this.beatHighscoreText.setText(t('hud.newRecord'));
        this.winText.setText(t('hud.win'));
        this.chainReactionText.setText(
            t('hud.chainReaction', { points: SUPERNOVA_CHAIN_BONUS })
        );
        this.instructionText.setText(t('hud.tapToPlay'));
        this.nextFruitText.setText(t('hud.next'));
        this.pauseTitleText.setText(t('pause.title'));
        this.pauseResumeButtonText.setText(t('pause.resume'));
        this.pauseMenuButtonText.setText(t('pause.backToMenu'));
    }

    updateScore(): void {
        this.score = this.registry.get('score');
        this.scoreText.setText(withLetterSpacing(this.score.toString()));
        if (this.registry.get('beatHighscore')) {
            this.highscoreText.setText(
                withLetterSpacing(this.score.toString())
            );
        }
    }

    update(time: number, delta: number): void {}

    gameOver(): void {
        this.gameOverText.setVisible(true);
        if (this.registry.get('beatHighscore')) {
            this.beatHighscoreText.setVisible(true);
        }
        if (this.registry.get('highscore')) {
            this.highscore = this.registry.get('highscore');
            this.highscoreText.setText(
                withLetterSpacing(this.highscore.toString())
            );
        }
        this.instructionText.setVisible(true);
        this.fingerIcon.setVisible(true);
    }

    onGameInit(): void {
        // If game is already started by this point, do not make them visible
        if (this.registry.get('gameStarted')) {
            return;
        }
        this.instructionText.setVisible(true);
        this.fingerIcon.setVisible(true);
    }

    onGameStarted(): void {
        this.instructionText.setVisible(false);
        this.fingerIcon.setVisible(false);
        this.gameOverText.setVisible(false);
        this.beatHighscoreText.setVisible(false);
    }

    onTap(): void {
        this.winText.setVisible(false);
    }

    onWin(): void {
        this.winText.setVisible(true);
    }

    onSupernovaChainReaction(position: { x: number; y: number }): void {
        this.chainReactionText.setPosition(position.x, position.y);
        this.chainReactionText.setVisible(true);
        this.time.delayedCall(1500, () => {
            this.chainReactionText.setVisible(false);
        });
    }

    onControlsChange(controls): void {
        if (controls === 'move') {
            this.leftArrow.setVisible(true);
            this.rightArrow.setVisible(true);
        } else {
            this.leftArrow.setVisible(false);
            this.rightArrow.setVisible(false);
        }
    }

    private onResize(gameSize: Phaser.Structs.Size): void {
        console.log('[HUDScene] resize ->', gameSize.width, gameSize.height);
        this.repositionHeader();
        this.rebuildPauseOverlayPreservingVisibility();
        this.repositionTransientTexts();
        this.rescaleFreeFloatingTextFontSizes();
    }

    // Re-derives a fontSize from the live this.scale.width against the
    // original 580-wide (CANVAS_WIDTH) reference every one of these px
    // values was tuned at — see HUD_TEXT_SCALE_REFERENCE_WIDTH's comment
    // for the full "why" (Scale.FIT used to do this for free via its CSS
    // scale transform; Scale.RESIZE doesn't). Returns a plain number of
    // pixels — callers append 'px' themselves for style-object literals,
    // or pass it straight to setFontSize(), which accepts either.
    private scaledFontSize(basePx: number, min: number, max: number): number {
        const scaled =
            basePx * (this.scale.width / HUD_TEXT_SCALE_REFERENCE_WIDTH);
        return Math.round(Math.max(min, Math.min(max, scaled)));
    }

    // Companion to repositionTransientTexts()/repositionHeader() — same
    // resize trigger, but for fontSize instead of x/y. Kept separate since
    // it also covers the always-visible score/record texts (not "transient"
    // like the game-over/win/instruction group), and to keep the min/max
    // pair for each text next to its own scaledFontSize() call, matching
    // how each one was first set up in create().
    private rescaleFreeFloatingTextFontSizes(): void {
        const scoreFontSize = this.scaledFontSize(16, 11, 20);
        this.scoreLabelText.setFontSize(scoreFontSize);
        this.scoreText.setFontSize(scoreFontSize);
        this.highScoreLabelText.setFontSize(scoreFontSize);
        this.highscoreText.setFontSize(scoreFontSize);

        const messageFontSize = this.scaledFontSize(16, 11, 22);
        this.gameOverText.setFontSize(messageFontSize);
        this.beatHighscoreText.setFontSize(messageFontSize);
        this.winText.setFontSize(messageFontSize);
        this.chainReactionText.setFontSize(messageFontSize);

        this.instructionText.setFontSize(this.scaledFontSize(24, 16, 30));
    }

    // RESIZE migration, stage 4, block 3 — game-over/win/instruction texts
    // are hidden almost all the time (setVisible(false) at creation, only
    // shown on specific game-state events), but a resize can still happen
    // while one is up (rotating the device on the game-over screen), so
    // this needs the same live re-derive as the always-visible header. Only
    // the X axis moves — the Y anchors (PLAY_AREA_CENTER_Y-based) are a
    // separate, pre-existing design decision this stage doesn't touch.
    private repositionTransientTexts(): void {
        this.gameOverText.x = this.scale.width / 4;
        this.beatHighscoreText.x = this.scale.width / 4;
        this.winText.x = this.scale.width / 4;
        this.instructionText.x = this.scale.width / 2;
        this.fingerIcon.x = this.scale.width / 2;
    }

    // RESIZE migration, stage 4, block 1 — everything anchored to the real
    // screen's top edge (score/record stay put, they're pinned to the
    // top-LEFT corner which never moves) needs to re-derive its X from the
    // live this.scale.width on every resize, not just once in create().
    // pauseIcon doesn't need its own line here — it's drawn in local space
    // and repositioned via setPosition(), see create() — but every other
    // element here is a plain x/y GameObject with no such shortcut.
    private repositionHeader(): void {
        const rightEdgeX = this.scale.width - 40;
        this.nextFruitGlow.x = rightEdgeX;
        this.nextFruitBack.x = rightEdgeX;
        this.nextFruitText.x = rightEdgeX;
        this.nextFruitSprite.x = rightEdgeX;
        this.pauseIcon.setX(this.scale.width / 2);
        this.rightArrow.x = this.scale.width - this.rightArrow.displayWidth / 2;
    }

    // RESIZE migration, stage 4, block 2 — GoldButton's Graphics background
    // bakes fillRoundedRect(left, top, ...) at absolute coordinates (see
    // ui/GoldButton.ts), it isn't drawn relative to the object's own x/y
    // transform — so unlike pauseIcon above, there's no setPosition() that
    // can move an already-built button. Rebuilding the whole overlay from
    // scratch at the new center on every resize is simpler and safer than
    // trying to special-case which parts can shift in place, and this
    // scene already treats a full create()-time rebuild as the normal way
    // to reset itself (see MainScene.ts's own scene-restart philosophy).
    private destroyPauseOverlay(): void {
        if (this.pauseOverlayElements) {
            this.pauseOverlayElements.forEach((el) => el.destroy());
        }
    }

    private buildPauseOverlay(): void {
        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        const backdrop = this.add.rectangle(
            centerX,
            centerY,
            this.scale.width,
            this.scale.height,
            0x000000,
            PAUSE_OVERLAY_BACKDROP_ALPHA
        );
        // Swallows clicks so they don't reach whatever's under the dimmed
        // board while paused.
        backdrop.setInteractive();

        const panel = this.add.rectangle(
            centerX,
            centerY,
            PAUSE_PANEL_WIDTH,
            PAUSE_PANEL_HEIGHT,
            PANEL_BG
        );
        panel.setStrokeStyle(2, PANEL_BORDER, 0.9);

        this.pauseTitleText = this.add.text(centerX, centerY - 80, t('pause.title'), {
            fontFamily: GAME_FONT_FAMILY,
            fontStyle: 'bold',
            fontSize: '28px',
            color: '#f3e2bc',
        });
        this.pauseTitleText.setOrigin(0.5);

        const resumeButton = this.createPauseOverlayButton(
            centerX,
            centerY - 10,
            t('pause.resume'),
            () => this.closePauseOverlay()
        );
        this.pauseResumeButtonText = resumeButton[1];
        const menuButton = this.createPauseOverlayButton(
            centerX,
            centerY + 60,
            t('pause.backToMenu'),
            () => this.returnToMenu()
        );
        this.pauseMenuButtonText = menuButton[1];

        this.pauseOverlayElements = [
            backdrop,
            panel,
            this.pauseTitleText,
            ...resumeButton,
            ...menuButton,
        ];
    }

    // Same rebuild as create()'s initial call, but preserves whatever the
    // overlay's visibility already was — a live resize/orientation change
    // while genuinely paused (not just a demo viewport swap) needs to stay
    // paused and visible, not silently snap back to hidden.
    private rebuildPauseOverlayPreservingVisibility(): void {
        const wasVisible =
            this.pauseOverlayElements?.[0]?.visible ?? false;
        this.destroyPauseOverlay();
        this.buildPauseOverlay();
        this.showPauseOverlay(wasVisible);
    }

    setNextFruitSprite(nextFruit: OrbTier): void {
        this.nextFruitSprite.setTexture(fruitTypeToTextureString(nextFruit));
        this.nextFruitSprite.setDisplaySize(
            NEXT_ORB_PREVIEW_SIZE,
            NEXT_ORB_PREVIEW_SIZE
        );
        this.nextFruitSprite.setVisible(true);
        this.nextFruitText.setVisible(true);
    }

    private createPauseOverlayButton(
        x: number,
        y: number,
        label: string,
        onClick: () => void
    ): [Phaser.GameObjects.Graphics, Phaser.GameObjects.Text] {
        return createGoldButton(
            this,
            x,
            y,
            PAUSE_BUTTON_WIDTH,
            PAUSE_BUTTON_HEIGHT,
            label,
            '20px',
            onClick
        );
    }

    private showPauseOverlay(visible: boolean): void {
        this.pauseOverlayElements.forEach((el) => el.setVisible(visible));
    }

    private enablePauseIcon(): void {
        // Local (0, 0) — matches how pauseIcon's shapes are now drawn (see
        // create()) — so this hit area rides along with the object's own
        // transform and never goes stale after setPosition() on resize.
        this.pauseIcon.setInteractive(
            new Phaser.Geom.Circle(0, 0, PAUSE_ICON_RADIUS),
            Phaser.Geom.Circle.Contains
        );
        this.pauseIcon.input.cursor = 'pointer';
    }

    private openPauseOverlay(): void {
        this.scene.pause('MainScene');
        this.pauseIcon.disableInteractive();
        this.showPauseOverlay(true);
    }

    private closePauseOverlay(): void {
        this.showPauseOverlay(false);
        this.enablePauseIcon();
        this.scene.resume('MainScene');
    }

    private returnToMenu(): void {
        this.showPauseOverlay(false);
        // MainScene's own 'returnToMenu' handler resets the board and stops
        // itself (see MainScene.ts) — this scene's job is just to trigger
        // that, then leave too. this.scene.start('MenuScene') stops THIS
        // scene (HUDScene) as a side effect before starting MenuScene —
        // same mechanism MenuScene's own "Jugar" button already relies on
        // in reverse.
        this.mainScene.events.emit('returnToMenu');
        if (debugEnabled) {
            this.scene.stop('DebugScene');
        }
        this.scene.start('MenuScene');
    }
}

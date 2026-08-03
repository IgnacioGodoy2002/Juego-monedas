import { OrbTier, fruitTypeToTextureString } from '../gameobjects/Fruit';
import { SUPERNOVA_CHAIN_BONUS } from './MainScene';
import { PLAY_AREA_CENTER_Y, PLAY_AREA_TOP_OFFSET } from '../config/boardLayout';

const GAME_OVER_SCREEN_OFFSET: number = -200;
const NEXT_ORB_PREVIEW_SIZE: number = 64;

const PAUSE_ICON_RADIUS = 20;
const PAUSE_OVERLAY_BACKDROP_ALPHA = 0.65;
const PAUSE_PANEL_WIDTH = 320;
const PAUSE_PANEL_HEIGHT = 230;
const PAUSE_BUTTON_WIDTH = 240;
const PAUSE_BUTTON_HEIGHT = 56;
// Same warm honey/amber palette MenuScene.ts's buttons use (BUTTON_FILL_TOP
// there) — flat here instead of gradient since this is a small modal, not
// the main menu, but intentionally the same family of color.
const PAUSE_BUTTON_FILL = 0xc47f3c;
const PAUSE_BUTTON_TEXT_COLOR = '#3a1f0a';

// "Luxury watch face" styling for the score/record readout: thin serif,
// normal (non-bold) weight, dark bronze — reads as a label printed directly
// on the game background rather than the cream/gold fill this used to have,
// which needed a stroke just to stay legible; a dark fill has enough
// contrast on its own, so no stroke here.
const HUD_SCORE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontStyle: 'normal',
    color: '#3a1f0a',
};

// Phaser 3.60's canvas Text object has no letterSpacing style property
// (only BitmapText does), so the "let the numbers breathe" spacing is faked
// by joining characters with a thin space glyph.
const HUD_LETTER_SPACER = ' ';
function withLetterSpacing(value: string): string {
    return value.split('').join(HUD_LETTER_SPACER);
}

export class HUDScene extends Phaser.Scene {
    private mainScene: Phaser.Scene;

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
        | Phaser.GameObjects.Text
    )[];

    // Same reasoning as MainScene.ts's boundOnControlsChange — this.game.
    // events is global and outlives this scene, so the exact function
    // reference needs to survive to be .off()'d on shutdown.
    private boundOnControlsChange = this.onControlsChange.bind(this);

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
        this.add.text(
            10,
            10,
            withLetterSpacing('Puntaje:'),
            HUD_SCORE_TEXT_STYLE
        );
        this.scoreText = this.add.text(
            120,
            10,
            withLetterSpacing('0'),
            HUD_SCORE_TEXT_STYLE
        );
        this.add.text(
            10,
            30,
            withLetterSpacing('Récord:'),
            HUD_SCORE_TEXT_STYLE
        );
        this.highscoreText = this.add.text(
            120,
            30,
            withLetterSpacing('0'),
            HUD_SCORE_TEXT_STYLE
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

        // Mirrors DebugScene.ts's own 'shutdown' listener pattern (see its
        // create()) — same idea, applied to the one thing *this* scene
        // registers on an emitter that outlives it. HUDScene's *other*
        // cross-scene listeners (all the this.mainScene.events.on(...)
        // calls above) don't need the same treatment: they live on
        // MainScene's own emitter, and MainScene's returnToMenu() already
        // wipes that whole emitter via removeAllListeners() when it stops.
        this.events.on('shutdown', () => {
            this.game.events.off('controlsChange', this.boundOnControlsChange);
        });

        this.gameOverText = this.add.text(
            (game.config.width as number) / 4,
            PLAY_AREA_CENTER_Y + GAME_OVER_SCREEN_OFFSET,
            '¡Fin del juego!'
        );
        this.gameOverText.setVisible(false);
        this.beatHighscoreText = this.add.text(
            (game.config.width as number) / 4,
            PLAY_AREA_CENTER_Y + 50 + GAME_OVER_SCREEN_OFFSET,
            '¡Nuevo récord!'
        );
        this.beatHighscoreText.setVisible(false);
        this.winText = this.add.text(
            (game.config.width as number) / 4,
            PLAY_AREA_CENTER_Y + GAME_OVER_SCREEN_OFFSET,
            '¡Llegaste al Supernova! ¡Genial!\n¡Seguí así!'
        );
        this.winText.setVisible(false);

        this.chainReactionText = this.add.text(
            0,
            0,
            `¡Reacción en cadena! +${SUPERNOVA_CHAIN_BONUS} puntos`
        );
        this.chainReactionText.setOrigin(0.5);
        this.chainReactionText.setVisible(false);

        // Add the instruction text
        this.instructionText = this.add.text(
            (game.config.width as number) / 2,
            PLAY_AREA_CENTER_Y - 50,
            'Tocá para soltar un orbe',
            {
                fontSize: '24px',
                align: 'center',
            }
        );
        this.instructionText.setOrigin(0.5);
        this.instructionText.setVisible(false);

        // Add the finger icon
        this.fingerIcon = this.add.image(
            (game.config.width as number) / 2,
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
            this.cameras.main.width - this.rightArrow.displayWidth / 2;
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
            (game.config.width as number) - 40,
            44,
            96,
            96,
            0xc25cff,
            0.25
        );

        // Add the next orb backing panel
        this.nextFruitBack = this.add.rectangle(
            (game.config.width as number) - 40,
            44,
            80,
            80,
            0x1c1c2e
        );
        this.nextFruitBack.setStrokeStyle(2, 0xc25cff, 0.9);

        // Add the next orb text — 13px (down from 24px) so "Siguiente" fits
        // the 80px-wide panel; Phaser's default Courier font is monospace at
        // ~0.6em/char, so 24px (~130px wide) was overflowing both the panel
        // and the canvas edge, which is what was clipping it visually.
        this.nextFruitText = this.add.text(
            (game.config.width as number) - 40,
            10,
            'Siguiente',
            {
                fontSize: '13px',
                align: 'center',
                color: '#ffffff',
            }
        );
        this.nextFruitText.setOrigin(0.5);
        this.nextFruitText.setVisible(false);

        // Add the next fruit sprite
        this.nextFruitSprite = new Phaser.GameObjects.Sprite(
            this,
            (game.config.width as number) - 40,
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
        const pauseIconX = (game.config.width as number) / 2;
        const pauseIconY = 44; // same header row as the Siguiente panel

        this.pauseIcon = this.add.graphics();
        this.pauseIcon.fillStyle(0x1c1c2e, 1);
        this.pauseIcon.fillCircle(pauseIconX, pauseIconY, PAUSE_ICON_RADIUS);
        this.pauseIcon.lineStyle(2, 0xc25cff, 0.9);
        this.pauseIcon.strokeCircle(pauseIconX, pauseIconY, PAUSE_ICON_RADIUS);
        this.pauseIcon.fillStyle(0xffffff, 1);
        this.pauseIcon.fillRect(pauseIconX - 7, pauseIconY - 9, 5, 18);
        this.pauseIcon.fillRect(pauseIconX + 2, pauseIconY - 9, 5, 18);
        this.enablePauseIcon();
        this.pauseIcon.on('pointerdown', () => this.openPauseOverlay());

        const centerX = (game.config.width as number) / 2;
        const centerY = (game.config.height as number) / 2;

        const backdrop = this.add.rectangle(
            centerX,
            centerY,
            game.config.width as number,
            game.config.height as number,
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
            0x1c1c2e
        );
        panel.setStrokeStyle(2, 0xc25cff, 0.9);

        const title = this.add.text(centerX, centerY - 80, 'Pausa', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '28px',
            color: '#ffffff',
        });
        title.setOrigin(0.5);

        const resumeButton = this.createPauseOverlayButton(
            centerX,
            centerY - 10,
            'Continuar',
            () => this.closePauseOverlay()
        );
        const menuButton = this.createPauseOverlayButton(
            centerX,
            centerY + 60,
            'Volver al menú',
            () => this.returnToMenu()
        );

        this.pauseOverlayElements = [
            backdrop,
            panel,
            title,
            ...resumeButton,
            ...menuButton,
        ];
        this.showPauseOverlay(false);

        this.scene.bringToTop();
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
    ): [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text] {
        const background = this.add.rectangle(
            x,
            y,
            PAUSE_BUTTON_WIDTH,
            PAUSE_BUTTON_HEIGHT,
            PAUSE_BUTTON_FILL
        );
        background.setInteractive();
        background.input.cursor = 'pointer';
        background.on('pointerdown', onClick);

        const text = this.add.text(x, y, label, {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: '22px',
            color: PAUSE_BUTTON_TEXT_COLOR,
        });
        text.setOrigin(0.5);

        return [background, text];
    }

    private showPauseOverlay(visible: boolean): void {
        this.pauseOverlayElements.forEach((el) => el.setVisible(visible));
    }

    private enablePauseIcon(): void {
        this.pauseIcon.setInteractive(
            new Phaser.Geom.Circle(
                (game.config.width as number) / 2,
                44,
                PAUSE_ICON_RADIUS
            ),
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

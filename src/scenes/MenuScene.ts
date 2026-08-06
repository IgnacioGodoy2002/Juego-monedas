import { CANVAS_WIDTH } from '../config/boardLayout';
import { loadBgm, getOrCreateBgm, playBgmIfNeeded } from '../managers/Bgm';
import {
    createGoldButton,
    GAME_FONT_FAMILY,
    GOLD_BORDER,
    GOLD_FILL_BOTTOM,
    GOLD_FILL_TOP,
    GOLD_TEXT_COLOR,
} from '../ui/GoldButton';
import { t, onLanguageChanged, offLanguageChanged } from '../i18n';
import { OrbTier, COIN_TIER_FILES } from '../gameobjects/Fruit';

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

// "Cómo jugar" mode — the coin hierarchy grid and the surrounding panel
// text. Panel width leaves ~40px margin on each side of the 580px canvas;
// height is never hardcoded (see buildHowToPlayMode's layout cursor) since
// pt/en translations wrap to a different number of lines than es.
const HOWTOPLAY_PANEL_WIDTH = 500;
const HOWTOPLAY_PANEL_PADDING = 24;
const HOWTOPLAY_SECTION_GAP = 20;
const HOWTOPLAY_HEADER_GAP = 6;
const HOWTOPLAY_HEADER_FONT_SIZE = '20px';
const HOWTOPLAY_TEXT_FONT_SIZE = '17px';
const HOWTOPLAY_HEADER_DOT_RADIUS = 4;
const HOWTOPLAY_COIN_SIZE = 62;
const HOWTOPLAY_COIN_COLS = 4;
const HOWTOPLAY_COIN_GAP = 12;

type MenuMode = 'menu' | 'howToPlay';

export class MenuScene extends Phaser.Scene {
    private bgm: Phaser.Sound.BaseSound;

    private mode: MenuMode = 'menu';

    // Kept so the languageChanged handler below can repaint them in place
    // — MenuScene never reloads mid-session on its own, only on a full
    // scene restart (which re-runs create() anyway), so this is purely for
    // the case where a first-time visitor's IP-based language detection
    // resolves *while* the menu is already showing (see i18n/index.ts).
    private titleText: Phaser.GameObjects.Text;
    private playButtonText: Phaser.GameObjects.Text;
    private settingsButtonText: Phaser.GameObjects.Text;
    private menuModeElements: (
        | Phaser.GameObjects.Graphics
        | Phaser.GameObjects.Text
    )[];

    private howToPlayObjectiveHeadingText: Phaser.GameObjects.Text;
    private howToPlayIntroText: Phaser.GameObjects.Text;
    private howToPlayControlsHeadingText: Phaser.GameObjects.Text;
    private howToPlayControlsBodyText: Phaser.GameObjects.Text;
    private howToPlayChainHeadingText: Phaser.GameObjects.Text;
    private howToPlaySpecialRuleHeadingText: Phaser.GameObjects.Text;
    private howToPlaySpecialRuleText: Phaser.GameObjects.Text;
    private howToPlayPauseHeadingText: Phaser.GameObjects.Text;
    private howToPlayPauseBodyText: Phaser.GameObjects.Text;
    private howToPlayGoodLuckText: Phaser.GameObjects.Text;
    private howToPlayBackButtonText: Phaser.GameObjects.Text;
    private howToPlayModeElements: (
        | Phaser.GameObjects.Rectangle
        | Phaser.GameObjects.Graphics
        | Phaser.GameObjects.Text
        | Phaser.GameObjects.Image
        | Phaser.GameObjects.Arc
    )[];

    private boundOnLanguageChanged = this.updateTranslatedTexts.bind(this);

    constructor() {
        super({
            key: 'MenuScene',
        });
    }

    preload(): void {
        this.load.image('menuJar', './assets/img/menu_jar.png');
        loadBgm(this);

        // Real coin sprites for the "Cómo jugar" hierarchy grid — same
        // source files and tier order as the actual game (COIN_TIER_FILES
        // in Fruit.ts), not a hand-copied list that could drift out of
        // sync if tiers are ever reordered again.
        for (let tier = OrbTier.Chispa; tier <= OrbTier.Supernova; tier++) {
            this.load.image(
                `howToPlayCoin${tier}`,
                `./assets/coins/${COIN_TIER_FILES[tier]}`
            );
        }
    }

    create(): void {
        const centerX = CANVAS_WIDTH / 2;

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
        // left above it. Only the small mute/settings icons are up top —
        // nowhere near as wide as the old 3-icon row — so the title only
        // needs to clear that, not a whole row.
        const titleY = 60;
        const titleFontSize = 36;

        // Set by showMode() below, once both modes' content exist — empty
        // here just to get the object created at the right depth/position.
        this.titleText = this.add
            .text(centerX, titleY, '', {
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

        this.buildMenuMode(centerX, jarTop, jarHeight);
        // Starts well past the neck (the jar is much narrower there than
        // HOWTOPLAY_PANEL_WIDTH — starting any higher than this made the
        // panel's corners visibly stick out past the glass on both sides,
        // rather than reading as "inside" the jar) — roughly where the
        // body has already widened to its full cylindrical shape, same
        // area buildMenuMode's own buttons start clearing at their 0.32.
        this.buildHowToPlayMode(centerX, jarTop + jarHeight * 0.18);

        this.showMode('menu');

        // Only fires if the language actually changes *after* this scene
        // is already showing — see boundOnLanguageChanged's own comment
        // above. MenuScene fully restarts on every menu<->game transition
        // (create() re-runs from scratch each time — see MainScene.ts's
        // returnToMenu() for why), so this can't accumulate duplicate
        // subscriptions across restarts as long as it's paired with the
        // 'shutdown' cleanup below every time.
        onLanguageChanged(this.boundOnLanguageChanged);
        this.events.once('shutdown', () => {
            offLanguageChanged(this.boundOnLanguageChanged);
        });
    }

    // Buttons sit inside the jar's empty glass, above the coin pile.
    // Found that boundary by scanning menu_jar.png for where saturated
    // (multi-hue) pixels start showing up row-by-row — glass/neck are
    // uniformly amber, the coins are what introduce green/blue/purple/
    // silver — and it lands around 55% down the content crop. Button Ys
    // below are comfortably above that line (jarTop + ~0.32 and ~0.41
    // of jarHeight), clear of both the neck above and the coins below.
    // Second button tightened from 0.45 to 0.41 — the wider gap read as
    // too much dead air between "Jugar" and "Configuración".
    private buildMenuMode(
        centerX: number,
        jarTop: number,
        jarHeight: number
    ): void {
        const playButton = this.createButton(
            centerX,
            jarTop + jarHeight * 0.32,
            t('menu.play'),
            () => {
                playBgmIfNeeded(this.bgm);
                this.scene.start('MainScene');
            }
        );
        this.playButtonText = playButton[1];

        const settingsButton = this.createButton(
            centerX,
            jarTop + jarHeight * 0.41,
            t('menu.settings'),
            () => {
                playBgmIfNeeded(this.bgm);
                this.showMode('howToPlay');
            }
        );
        this.settingsButtonText = settingsButton[1];

        this.menuModeElements = [...playButton, ...settingsButton];
    }

    // Panel height is never hardcoded — built with a running Y cursor so
    // pt/en text (which word-wraps to a different number of lines than es)
    // can't push the back button past a fixed boundary or overlap the
    // coin grid. The panel background is created *first*, at a placeholder
    // size, specifically so it renders behind the content by ordinary
    // display-list order (created before it) instead of via setDepth —
    // setDepth(-1) sorts against the *whole scene*, not just this mode's
    // own elements, which put an earlier version of this behind the jar
    // image too (also depth 0, added before this method runs) instead of
    // just behind its own text/icons, leaving the jar glass showing
    // through where the panel should have been opaque. Resized/
    // repositioned to its real dimensions at the end, once cursorY is
    // known.
    //
    // Section structure (Objetivo / Controles / Jerarquía de monedas /
    // Reacción en cadena / Pausa) and the dot-accent header style mirror
    // the approved wireframe (artifact "'Cómo jugar' como un segundo modo
    // del mismo frasco") as closely as Phaser's Text/Graphics primitives
    // allow. The wireframe's own panel fill (rgba(43,28,16,0.93), i.e.
    // PANEL_BG) reads as near-black once placed over this game's actual
    // (much brighter/golden) jar art instead of the wireframe's own dark
    // page backdrop — so this panel intentionally uses GOLD_FILL_BOTTOM/
    // GOLD_BORDER (the same warm brown already used for the *bottom* of
    // every button's gradient) instead of PANEL_BG/PANEL_BORDER, which
    // stay reserved for the pause overlay and "Siguiente" panel.
    private buildHowToPlayMode(centerX: number, top: number): void {
        const contentWidth = HOWTOPLAY_PANEL_WIDTH - HOWTOPLAY_PANEL_PADDING * 2;
        const contentLeft = centerX - contentWidth / 2;
        const elements: (
            | Phaser.GameObjects.Rectangle
            | Phaser.GameObjects.Graphics
            | Phaser.GameObjects.Text
            | Phaser.GameObjects.Image
            | Phaser.GameObjects.Arc
        )[] = [];

        const panel = this.add.rectangle(
            centerX,
            top,
            HOWTOPLAY_PANEL_WIDTH,
            1,
            GOLD_FILL_BOTTOM,
            0.94
        );
        panel.setStrokeStyle(2, GOLD_BORDER, 1);
        elements.push(panel);

        let cursorY = top + HOWTOPLAY_PANEL_PADDING;

        // Small dot-accent + bold label, same "section header" pattern the
        // wireframe used for all five sections — kept as a local closure
        // (rather than a private method) since it needs to both push onto
        // this call's `elements` array and advance the shared cursor.
        const addSectionHeading = (label: string): Phaser.GameObjects.Text => {
            const dot = this.add.circle(
                contentLeft + HOWTOPLAY_HEADER_DOT_RADIUS,
                cursorY + 12,
                HOWTOPLAY_HEADER_DOT_RADIUS,
                GOLD_FILL_TOP
            );
            elements.push(dot);

            const heading = this.add.text(
                contentLeft + HOWTOPLAY_HEADER_DOT_RADIUS * 2 + 8,
                cursorY,
                label,
                {
                    fontFamily: GAME_FONT_FAMILY,
                    fontStyle: 'bold',
                    fontSize: HOWTOPLAY_HEADER_FONT_SIZE,
                    color: GOLD_TEXT_COLOR,
                }
            );
            heading.setOrigin(0, 0);
            elements.push(heading);
            cursorY += heading.height + HOWTOPLAY_HEADER_GAP;
            return heading;
        };

        // Left-aligned (not centered) body paragraph — matches the
        // wireframe's own .htp-desc, which reads as normal left-aligned
        // prose under its dot-accent header rather than centered blurb
        // text.
        const addBodyText = (label: string): Phaser.GameObjects.Text => {
            const body = this.add.text(contentLeft, cursorY, label, {
                fontFamily: GAME_FONT_FAMILY,
                fontSize: HOWTOPLAY_TEXT_FONT_SIZE,
                color: GOLD_TEXT_COLOR,
                wordWrap: { width: contentWidth },
            });
            body.setOrigin(0, 0);
            elements.push(body);
            cursorY += body.height + HOWTOPLAY_SECTION_GAP;
            return body;
        };

        const addDivider = (): void => {
            const divider = this.add.rectangle(
                centerX,
                cursorY,
                contentWidth,
                1,
                GOLD_BORDER,
                0.5
            );
            elements.push(divider);
            cursorY += HOWTOPLAY_SECTION_GAP;
        };

        // --- Objetivo ---
        this.howToPlayObjectiveHeadingText = addSectionHeading(
            t('howToPlay.objectiveHeading')
        );
        this.howToPlayIntroText = addBodyText(t('howToPlay.intro'));

        // --- Controles ---
        this.howToPlayControlsHeadingText = addSectionHeading(
            t('howToPlay.controlsHeading')
        );
        this.howToPlayControlsBodyText = addBodyText(
            t('howToPlay.controlsBody')
        );

        addDivider();

        // --- Jerarquía de monedas --- (reuses chainAriaLabel, already
        // "Jerarquía de monedas" in all three languages and still used as
        // the old DOM popup's SVG aria-label — same concept, dual-purpose
        // rather than a duplicate key).
        this.howToPlayChainHeadingText = addSectionHeading(
            t('howToPlay.chainAriaLabel')
        );

        // Coin hierarchy grid — real sprites in tier order, replacing what
        // used to be the "Cobre -> Bronce -> ... -> SP." prose
        // (howToPlay.chain) in the old popup. That translation key is
        // still in es/pt/en.json, just no longer rendered anywhere.
        const tierCount = OrbTier.Supernova - OrbTier.Chispa + 1;
        const rows = Math.ceil(tierCount / HOWTOPLAY_COIN_COLS);
        const cellSize = HOWTOPLAY_COIN_SIZE + HOWTOPLAY_COIN_GAP;
        const gridWidth = HOWTOPLAY_COIN_COLS * cellSize - HOWTOPLAY_COIN_GAP;
        const gridLeft = centerX - gridWidth / 2 + HOWTOPLAY_COIN_SIZE / 2;

        for (let tier = OrbTier.Chispa; tier <= OrbTier.Supernova; tier++) {
            const col = tier % HOWTOPLAY_COIN_COLS;
            const row = Math.floor(tier / HOWTOPLAY_COIN_COLS);
            const icon = this.add.image(
                gridLeft + col * cellSize,
                cursorY + HOWTOPLAY_COIN_SIZE / 2 + row * cellSize,
                `howToPlayCoin${tier}`
            );
            icon.setDisplaySize(HOWTOPLAY_COIN_SIZE, HOWTOPLAY_COIN_SIZE);
            elements.push(icon);
        }
        cursorY += rows * cellSize - HOWTOPLAY_COIN_GAP + HOWTOPLAY_SECTION_GAP;

        addDivider();

        // --- Reacción en cadena ---
        this.howToPlaySpecialRuleHeadingText = addSectionHeading(
            t('howToPlay.specialRuleHeading')
        );
        this.howToPlaySpecialRuleText = addBodyText(t('howToPlay.specialRule'));

        // --- Pausa --- (reuses pause.title, "Pausa" in all three
        // languages — same word, same concept as the real pause overlay).
        this.howToPlayPauseHeadingText = addSectionHeading(t('pause.title'));
        this.howToPlayPauseBodyText = addBodyText(t('howToPlay.pauseBody'));

        this.howToPlayGoodLuckText = this.add.text(
            centerX,
            cursorY,
            t('howToPlay.goodLuck'),
            {
                fontFamily: GAME_FONT_FAMILY,
                fontStyle: 'bold',
                fontSize: HOWTOPLAY_TEXT_FONT_SIZE,
                color: '#fff5d6',
                align: 'center',
            }
        );
        this.howToPlayGoodLuckText.setOrigin(0.5, 0);
        elements.push(this.howToPlayGoodLuckText);
        cursorY += this.howToPlayGoodLuckText.height + HOWTOPLAY_SECTION_GAP;

        const backButtonY = cursorY + BUTTON_HEIGHT / 2;
        // Reuses pause.backToMenu ("Volver al menú") rather than inventing
        // a new key — same destination, same action, from the player's
        // perspective there's no reason for it to say anything different.
        const backButton = createGoldButton(
            this,
            centerX,
            backButtonY,
            BUTTON_WIDTH,
            BUTTON_HEIGHT,
            t('pause.backToMenu'),
            '24px',
            () => this.showMode('menu')
        );
        this.howToPlayBackButtonText = backButton[1];
        elements.push(...backButton);
        cursorY = backButtonY + BUTTON_HEIGHT / 2 + HOWTOPLAY_PANEL_PADDING;

        // Now that the real extent is known, size/reposition the
        // placeholder created at the top of this method — still the first
        // thing in the display list for this mode, so it still renders
        // behind everything above without needing setDepth.
        const panelHeight = cursorY - top;
        panel.setSize(HOWTOPLAY_PANEL_WIDTH, panelHeight);
        panel.setPosition(centerX, top + panelHeight / 2);

        this.howToPlayModeElements = elements;
    }

    private showMode(mode: MenuMode): void {
        this.mode = mode;
        const showingMenu = mode === 'menu';
        this.menuModeElements.forEach((el) => el.setVisible(showingMenu));
        this.howToPlayModeElements.forEach((el) =>
            el.setVisible(!showingMenu)
        );
        this.titleText.setText(
            showingMenu ? t('menu.title') : t('howToPlay.heading')
        );
    }

    // Repaints every translated Text object in place, for whichever mode
    // is currently showing — covers the case where a first-time visitor's
    // IP-based language detection resolves *while* this scene is already
    // showing (see i18n/index.ts). Doesn't re-run the "Cómo jugar" panel's
    // layout cursor, so a language change that happens to land exactly
    // while that panel is open could leave slightly more/less empty space
    // than an ideal reflow would — same simplification HUDScene's pause
    // overlay already makes for its own text, and just as unlikely to
    // actually coincide with anyone seeing it.
    private updateTranslatedTexts(): void {
        this.titleText.setText(
            this.mode === 'menu' ? t('menu.title') : t('howToPlay.heading')
        );
        this.playButtonText.setText(t('menu.play'));
        this.settingsButtonText.setText(t('menu.settings'));
        this.howToPlayObjectiveHeadingText.setText(
            t('howToPlay.objectiveHeading')
        );
        this.howToPlayIntroText.setText(t('howToPlay.intro'));
        this.howToPlayControlsHeadingText.setText(
            t('howToPlay.controlsHeading')
        );
        this.howToPlayControlsBodyText.setText(t('howToPlay.controlsBody'));
        this.howToPlayChainHeadingText.setText(t('howToPlay.chainAriaLabel'));
        this.howToPlaySpecialRuleHeadingText.setText(
            t('howToPlay.specialRuleHeading')
        );
        this.howToPlaySpecialRuleText.setText(t('howToPlay.specialRule'));
        this.howToPlayPauseHeadingText.setText(t('pause.title'));
        this.howToPlayPauseBodyText.setText(t('howToPlay.pauseBody'));
        this.howToPlayGoodLuckText.setText(t('howToPlay.goodLuck'));
        this.howToPlayBackButtonText.setText(t('pause.backToMenu'));
    }

    private createButton(
        x: number,
        y: number,
        label: string,
        onClick: () => void
    ): [Phaser.GameObjects.Graphics, Phaser.GameObjects.Text] {
        return createGoldButton(
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

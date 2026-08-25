import {
    createGoldButton,
    GAME_FONT_FAMILY,
    PANEL_BG,
    PANEL_BORDER,
} from '../ui/GoldButton';
import { t, onLanguageChanged, offLanguageChanged } from '../i18n';
import { applyUniformDPRCameraFit, applyDPRToAllText } from '../util/HiDPI';

// Mock leaderboard — Coin Kingdom's SURA integration is "parent-submit"
// only (see SuraIntegrationService.ts): the game sends its own score to
// the host but has no message to request back a real cross-player
// ranking. This placeholder list stands in until/unless SURA adds that,
// same approach as the sibling Pengu Rush project's own mock service.
const MOCK_PLAYERS: { name: string; score: number }[] = [
    { name: 'Fede_K', score: 4200 },
    { name: 'Cami.R', score: 3150 },
    { name: 'ElRey92', score: 2680 },
    { name: 'Sofi_M', score: 2100 },
    { name: 'Bruno.T', score: 1780 },
    { name: 'Naty_G', score: 1500 },
    { name: 'Lucas.V', score: 1290 },
    { name: 'MoniOK', score: 980 },
];

const PANEL_MAX_WIDTH = 460;
const PANEL_PADDING = 24;
const ROW_H = 44;
const ROW_START_GAP = 16;
const BACKDROP_ALPHA = 0.65;
const BACK_BUTTON_GAP = 28;
const BACK_BUTTON_WIDTH = 240;
const BACK_BUTTON_HEIGHT = 56;

// Same drawn-badge technique used for Pengu Rush's leaderboard — a plain
// rank number for 4th place onward, a small Graphics medal (disc + ribbon
// tail + shine) for the top 3, instead of an emoji glyph that renders
// differently per OS/browser.
const MEDAL_R = 13;
const MEDAL_COLORS: { fill: number; rim: number; ribbon: number; shine: number }[] = [
    { fill: 0xffc93c, rim: 0xb8860b, ribbon: 0xb8860b, shine: 0xfff3c4 }, // gold
    { fill: 0xd9dee3, rim: 0x8a939c, ribbon: 0x8a939c, shine: 0xf3f5f7 }, // silver
    { fill: 0xcd7f32, rim: 0x8b5a2b, ribbon: 0x8b5a2b, shine: 0xe8b27d }, // bronze
];

const YOU_COLOR = '#ffd76a';
const ROW_COLOR = '#f3e2bc';
const RANK_COLOR = '#c9a876';

interface RankingRow {
    name: string;
    score: number;
    isYou: boolean;
}

export class RankingScene extends Phaser.Scene {
    private titleText: Phaser.GameObjects.Text;
    private backButtonText: Phaser.GameObjects.Text;
    private elements: (
        | Phaser.GameObjects.Rectangle
        | Phaser.GameObjects.Graphics
        | Phaser.GameObjects.Text
        | Phaser.GameObjects.Container
    )[] = [];

    private boundOnLanguageChanged = this.buildContent.bind(this);
    private boundOnResize = this.onResize.bind(this);

    constructor() {
        super({ key: 'RankingScene' });
    }

    create(): void {
        this.buildContent();

        onLanguageChanged(this.boundOnLanguageChanged);
        this.scale.on('resize', this.boundOnResize);
        applyUniformDPRCameraFit(this);
        applyDPRToAllText(this);

        this.events.once('shutdown', () => {
            offLanguageChanged(this.boundOnLanguageChanged);
            this.scale.off('resize', this.boundOnResize);
        });
    }

    private onResize(gameSize: Phaser.Structs.Size): void {
        // Same 0x0-during-Ajustes guard as every other resize-driven scene
        // (MenuScene/HUDScene) — destroyContent()/buildContent() below
        // rebuild everything from this.scale.width/height.
        if (gameSize.width === 0 || gameSize.height === 0) {
            return;
        }
        applyUniformDPRCameraFit(this);
        this.buildContent();
        applyDPRToAllText(this);
    }

    private destroyContent(): void {
        this.elements.forEach((el) => el.destroy());
        this.elements = [];
    }

    private buildContent(): void {
        this.destroyContent();

        const centerX = this.scale.width / 2;
        const centerY = this.scale.height / 2;

        const rows = this.buildRows();
        const panelWidth = Math.min(PANEL_MAX_WIDTH, this.scale.width - 40);
        const titleHeight = 44;
        const listHeight = rows.length * ROW_H;
        const panelHeight =
            PANEL_PADDING * 2 +
            titleHeight +
            ROW_START_GAP +
            listHeight +
            BACK_BUTTON_GAP +
            BACK_BUTTON_HEIGHT;

        const backdrop = this.add.rectangle(
            centerX,
            centerY,
            this.scale.width,
            this.scale.height,
            0x000000,
            BACKDROP_ALPHA
        );
        backdrop.setInteractive();
        this.elements.push(backdrop);

        const panelTop = centerY - panelHeight / 2;
        const panel = this.add.rectangle(
            centerX,
            centerY,
            panelWidth,
            panelHeight,
            PANEL_BG
        );
        panel.setStrokeStyle(2, PANEL_BORDER, 0.9);
        this.elements.push(panel);

        this.titleText = this.add.text(
            centerX,
            panelTop + PANEL_PADDING,
            t('ranking.title'),
            {
                fontFamily: GAME_FONT_FAMILY,
                fontStyle: 'bold',
                fontSize: '28px',
                color: '#fff5d6',
            }
        );
        this.titleText.setOrigin(0.5, 0);
        this.elements.push(this.titleText);

        const rowsTop =
            panelTop + PANEL_PADDING + titleHeight + ROW_START_GAP;
        const rowLeft = centerX - panelWidth / 2 + PANEL_PADDING;
        const rowRight = centerX + panelWidth / 2 - PANEL_PADDING;

        rows.forEach((row, i) => {
            const rowY = rowsTop + i * ROW_H + ROW_H / 2;
            const color = row.isYou ? YOU_COLOR : ROW_COLOR;

            const rank =
                i < 3
                    ? this.buildMedalIcon(rowLeft + MEDAL_R, rowY, i)
                    : this.add
                          .text(rowLeft + MEDAL_R, rowY, `${i + 1}`, {
                              fontFamily: GAME_FONT_FAMILY,
                              fontSize: '18px',
                              color: row.isYou ? YOU_COLOR : RANK_COLOR,
                          })
                          .setOrigin(0.5);
            this.elements.push(rank);

            const name = this.add.text(
                rowLeft + MEDAL_R * 2 + 12,
                rowY,
                row.name,
                {
                    fontFamily: GAME_FONT_FAMILY,
                    fontStyle: row.isYou ? 'bold' : 'normal',
                    fontSize: '18px',
                    color,
                }
            );
            name.setOrigin(0, 0.5);
            this.elements.push(name);

            const score = this.add.text(
                rowRight,
                rowY,
                row.score.toLocaleString(),
                {
                    fontFamily: GAME_FONT_FAMILY,
                    fontStyle: 'bold',
                    fontSize: '18px',
                    color,
                }
            );
            score.setOrigin(1, 0.5);
            this.elements.push(score);
        });

        const backButtonY =
            rowsTop + listHeight + BACK_BUTTON_GAP + BACK_BUTTON_HEIGHT / 2;
        const backButton = createGoldButton(
            this,
            centerX,
            backButtonY,
            BACK_BUTTON_WIDTH,
            BACK_BUTTON_HEIGHT,
            t('ranking.back'),
            '22px',
            () => this.scene.start('MenuScene')
        );
        this.backButtonText = backButton[1];
        this.elements.push(...backButton);
    }

    // Sorts the mock leaderboard together with the player's own local
    // high score (gameState.highScore, the same value HUDScene/MainScene
    // already read/write — see storage/index.ts) into one ranked list.
    private buildRows(): RankingRow[] {
        const you: RankingRow = {
            name: t('ranking.you'),
            score: gameState.highScore,
            isYou: true,
        };
        const rows: RankingRow[] = [
            ...MOCK_PLAYERS.map((p) => ({ ...p, isYou: false })),
            you,
        ];
        rows.sort((a, b) => b.score - a.score);
        return rows;
    }

    private buildMedalIcon(
        cx: number,
        cy: number,
        tier: number
    ): Phaser.GameObjects.Container {
        const { fill, rim, ribbon, shine } = MEDAL_COLORS[tier];
        const g = this.add.graphics();

        g.fillStyle(ribbon, 1);
        g.fillTriangle(-5, 3, -12, 17, 1, 7);
        g.fillTriangle(5, 3, 12, 17, -1, 7);

        g.fillStyle(rim, 1);
        g.fillCircle(0, 0, MEDAL_R);
        g.fillStyle(fill, 1);
        g.fillCircle(0, 0, MEDAL_R - 2);
        g.fillStyle(shine, 0.85);
        g.fillCircle(-4, -4, 2.8);

        const label = this.add
            .text(0, 0.5, `${tier + 1}`, {
                fontFamily: GAME_FONT_FAMILY,
                fontSize: '13px',
                fontStyle: 'bold',
                color: '#3a2a10',
            })
            .setOrigin(0.5);

        return this.add.container(cx, cy, [g, label]);
    }
}

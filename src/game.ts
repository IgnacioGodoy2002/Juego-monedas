import 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { MainScene } from './scenes/MainScene';
import { HUDScene } from './scenes/HUDScene';
import { DebugScene } from './scenes/DebugScene';
import { initSuraService } from './integration/sura/SuraIntegrationService';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config/boardLayout';
import {
    createDialogContentFromTemplate,
    renderDialog,
    renderNotification,
} from './page';
import {
    GameOptions,
    GameState,
    loadGameOptions,
    loadGameState,
    saveGameOptions,
} from './storage';
import { BGM_KEY, setBgmVolume } from './managers/Bgm';

// Same 10-step granularity in both directions; rounded to one decimal so
// repeated +/- clicks land on exact tenths (0.1 + 0.1 + ... in floating
// point drifts to values like 0.30000000000000004 otherwise).
const MUSIC_VOLUME_STEP = 0.1;

const THEME_SETTING_NAME = 'theme-switch';
const CONTROLS_SETTING_NAME = 'controls';

const LANDSCAPE_CLASS_NAME = 'landscape';

declare global {
    var game: SuikaCloneGame;
    var MobileDetect: any;
    var gameOptions: GameOptions;
    var gameState: GameState;
    var debugEnabled: boolean;
}

global.gameOptions = loadGameOptions();
global.gameState = loadGameState();
// IS_DEBUG (set at build time for dev/test builds) is necessary but not
// sufficient — the debug overlay is opt-in per session via ?debug=1, so that
// `npm run dev` doesn't show it by default for everyday testing.
global.debugEnabled =
    Boolean(process.env.IS_DEBUG) &&
    new URLSearchParams(window.location.search).get('debug') === '1';

class SuikaCloneGame extends Phaser.Game {
    constructor(config: Phaser.Types.Core.GameConfig) {
        super(config);
    }
}

var scenes: Function[] = [MenuScene, MainScene, HUDScene];

if (debugEnabled) {
    scenes.push(DebugScene);
}

window.onload = () => {
    const config: Phaser.Types.Core.GameConfig = {
        title: 'Suika Clone',
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        scene: scenes,
        type: Phaser.AUTO,
        parent: 'content',
        // Transparent canvas so index.css's body background shows through
        // anywhere the game doesn't draw (the gap between the header and
        // the jar's neck, etc.) instead of a flat color.
        transparent: true,
        input: {
            // There needs to be at least 3 active pointers for multi-touch to work
            activePointers: 3,
        },
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
            default: 'matter',
            matter: {
                // Was true, but Matter.js never re-checks a sleeping body
                // once whatever it was resting on gets removed (e.g. a
                // merge, or the 3+ Supernova cluster explosion) — nothing
                // in the engine re-applies gravity to it until an unrelated
                // future collision happens to touch it, so it visibly
                // floats in place until then. The board is small enough
                // (hard-capped by the jar's size) that the perf case for
                // sleeping doesn't really apply here.
                enableSleeping: false,
            },
        },
    };

    const startGame = () => {
        var game = new SuikaCloneGame(config);
        global.game = game;

        initSuraService().initialize();
    };

    // Phaser draws Text on <canvas>, not the DOM — if 'Baloo 2' (loaded via
    // index.html's Google Fonts <link>) hasn't finished downloading yet,
    // the very first frame renders with the browser's fallback font and
    // never gets redrawn once the real font arrives (unlike DOM text,
    // which reflows on its own). document.fonts.ready resolves once every
    // @font-face referenced by currently-rendered CSS has loaded (or
    // failed), so waiting on it here avoids that silent fallback.
    if (document.fonts) {
        document.fonts.ready.then(startGame);
    } else {
        startGame();
    }
};

const helpLink: HTMLAnchorElement = document.querySelector('.help-link');
helpLink.addEventListener('click', (e) => {
    e.preventDefault();
    renderDialog(createDialogContentFromTemplate('#how-to-play'), true);
    helpLink.blur();
});

// Mutes every game sound (bgm + the collision effect) via Phaser's global
// Sound Manager rather than routing a per-scene event through MainScene —
// there's only ever the two sounds, so a single game-wide switch is enough.
const muteLink: HTMLAnchorElement = document.querySelector('.mute-link');
muteLink.addEventListener('click', (e) => {
    e.preventDefault();
    // Capture the target state once instead of reading game.sound.mute
    // again after setting it — WebAudioSoundManager's mute getter reads a
    // GainNode's value, which the setter changes via setValueAtTime; that
    // change isn't reflected synchronously, so re-reading it right after
    // assigning intermittently returns the stale pre-click value.
    const nextMuted = !game.sound.mute;
    game.sound.mute = nextMuted;
    muteLink.classList.toggle('muted', nextMuted);
    muteLink.blur();
});

// Same gameOptions.musicVolume the shared bgm instance was created with
// (see Bgm.ts's getOrCreateBgm) — clamped to [0,1] and persisted so the
// level picked here survives a reload.
const adjustMusicVolume = (delta: number): void => {
    const nextVolume = Math.min(
        1,
        Math.max(0, Math.round((gameOptions.musicVolume + delta) * 10) / 10)
    );
    gameOptions.musicVolume = nextVolume;
    saveGameOptions(gameOptions);
    // No-op if no scene has created the Sound instance yet — harmless,
    // since getOrCreateBgm reads gameOptions.musicVolume (just saved above)
    // the first time it does run.
    setBgmVolume(game.registry.get(BGM_KEY), nextVolume);
};

const volumeDownLink: HTMLAnchorElement = document.querySelector(
    '.volume-down-link'
);
volumeDownLink.addEventListener('click', (e) => {
    e.preventDefault();
    adjustMusicVolume(-MUSIC_VOLUME_STEP);
    volumeDownLink.blur();
});

const volumeUpLink: HTMLAnchorElement = document.querySelector(
    '.volume-up-link'
);
volumeUpLink.addEventListener('click', (e) => {
    e.preventDefault();
    adjustMusicVolume(MUSIC_VOLUME_STEP);
    volumeUpLink.blur();
});

const gamePane: HTMLDivElement = document.querySelector('.game');
const settingsPane: HTMLDivElement = document.querySelector('.settings');
const settingsLink: HTMLAnchorElement = document.querySelector(
    '.settings-link'
);

const toggleSettings = () => {
    settingsLink.blur();
    if (settingsPane.style.display === 'none') {
        gamePane.style.display = 'none';
        settingsPane.style.display = 'flex';
    } else {
        gamePane.style.display = 'flex';
        settingsPane.style.display = 'none';
    }
};

settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSettings();
});

const settings = document.querySelectorAll('.setting');
settings.forEach((setting) => {
    const elem = setting as HTMLDivElement;
    const toggle = setting.querySelector('.toggle');
    setting.addEventListener('click', (e) => {
        let optionChanged = false;
        if (elem.classList.contains(THEME_SETTING_NAME)) {
            if (game.registry.get('gameStarted')) {
                renderNotification(
                    'Solo podés cambiar el tema cuando no hay una partida en curso'
                );
                return;
            }
            gameOptions.theme =
                gameOptions.theme === 'fruit_basket'
                    ? 'numbers'
                    : 'fruit_basket';
            game.events.emit('themeChange', gameOptions.theme);
            toggle.innerHTML =
                gameOptions.theme === 'fruit_basket'
                    ? 'Orb Maker'
                    : 'Números';
            optionChanged = true;
        } else if (elem.classList.contains(CONTROLS_SETTING_NAME)) {
            gameOptions.controls =
                gameOptions.controls === 'tap' ? 'move' : 'tap';
            game.events.emit('controlsChange', gameOptions.controls);
            toggle.innerHTML = gameOptions.controls === 'move' ? 'Mover' : 'Tocar';
            optionChanged = true;
        }
        if (optionChanged) {
            saveGameOptions(gameOptions);
        }
    });
    if (elem.classList.contains(THEME_SETTING_NAME)) {
        toggle.innerHTML =
            gameOptions.theme === 'fruit_basket' ? 'Orb Maker' : 'Números';
    } else if (elem.classList.contains(CONTROLS_SETTING_NAME)) {
        toggle.innerHTML = gameOptions.controls === 'move' ? 'Mover' : 'Tocar';
    }
});

const closeDialog = (dialog, overlayBackElem) => {
    if (dialog) {
        // Check if dialog is closable first before closing (close button would be visible, if so)
        const closeBtn = dialog.querySelector('button.close');
        if (closeBtn.style.display === 'none') {
            return;
        }
        dialog.remove();
    }
    // NTS: Perhaps it'd make more sense if overlay backdrop only disappeared when a valid dialog is passed,
    // but if an invalid dialog is being passed, it might not be on the screen either.
    // In this case, it may be better to leave this as-is and always have the backdrop close so that players can still play.
    overlayBackElem.style.display = 'none';
};

const handleKeyInput = (key) => {
    const dialog = document.querySelector('.dialog');
    if (dialog && (key === 'enter' || key === 'escape')) {
        return closeDialog(dialog, overlayBackElem);
    }
};

window.addEventListener('keydown', (e) => {
    handleKeyInput(e.key.toLowerCase());
});

const overlayBackElem = document.querySelector('.overlay-back');
overlayBackElem.addEventListener('click', (e) => {
    const dialog = document.querySelector('.dialog');
    closeDialog(dialog, overlayBackElem);
});

const landscapeQuery = window.matchMedia('(orientation: landscape)');

const checkForOrientation = (mediaQueryEvent) => {
    const md =
        typeof MobileDetect !== 'undefined' &&
        new MobileDetect(window.navigator.userAgent);
    if (md && mediaQueryEvent.matches && md.mobile()) {
        document.getElementById('landscape-overlay').style.display = 'block';
        document.body.classList.add(LANDSCAPE_CLASS_NAME);
        // Have the snow element appear on top of the landscape overlay
        // (will only be visible if the "display" attribute is set, though)
        // if (snowEmbed) snowEmbed.style.zIndex = '99999';
    } else {
        document.getElementById('landscape-overlay').style.display = 'none';
        document.body.classList.remove(LANDSCAPE_CLASS_NAME);
        // if (snowEmbed) snowEmbed.style.zIndex = '';
    }
};

if (landscapeQuery.addEventListener) {
    landscapeQuery.addEventListener('change', function (event) {
        checkForOrientation(event);
    });
} else {
    // Support for older browsers, addListener is deprecated
    landscapeQuery.addListener(checkForOrientation);
}

checkForOrientation(landscapeQuery);

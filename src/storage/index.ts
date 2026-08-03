import { GameControl, GameTheme } from '../types';

const GAME_OPTIONS_KEY = 'game_options';
const GAME_STATE_KEY = 'game_state';

export interface GameOptions {
    controls: GameControl;
    theme: GameTheme;
    musicVolume: number;
}

export interface GameState {
    hasPlayedBefore: boolean;
    highScore: number;
}

function createDefaultGameOptions(): GameOptions {
    return {
        controls: 'tap',
        theme: 'fruit_basket',
        musicVolume: 0.4,
    };
}

function createDefaultGameState(): GameState {
    return {
        hasPlayedBefore: false,
        highScore: 0,
    };
}

export function loadGameOptions() {
    let gameOptions = createDefaultGameOptions();
    try {
        const gameOptionsStr = window.localStorage.getItem(GAME_OPTIONS_KEY);
        if (!gameOptionsStr) {
            return gameOptions;
        }
        // Merge over the defaults instead of replacing them outright —
        // options saved before musicVolume existed would otherwise come
        // back with musicVolume undefined instead of falling back to 0.4.
        gameOptions = { ...gameOptions, ...JSON.parse(gameOptionsStr) };
    } catch (e) {
        console.error(e);
    }
    return gameOptions;
}

export function saveGameOptions(newOptions) {
    window.localStorage.setItem(GAME_OPTIONS_KEY, JSON.stringify(newOptions));
}

export function loadGameState() {
    let gameState = createDefaultGameState();
    try {
        const gameStateStr = window.localStorage.getItem(GAME_STATE_KEY);
        if (!gameStateStr) {
            return gameState;
        }
        gameState = JSON.parse(gameStateStr);
    } catch (e) {
        console.error(e);
    }
    return gameState;
}

export function saveGameState(newState) {
    window.localStorage.setItem(GAME_STATE_KEY, JSON.stringify(newState));
}

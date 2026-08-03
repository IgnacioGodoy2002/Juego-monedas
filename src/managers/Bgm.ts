export const BGM_KEY = 'bgm';
const BGM_LOOP = true;
// Fallback only — gameOptions.musicVolume (loaded from localStorage at
// startup, see storage/index.ts) is what actually gets used once it's
// available, so the volume the user last set persists across sessions
// instead of always starting back at this default.
const BGM_DEFAULT_VOLUME = 0.4;

// Queues the audio load — call once, from whichever scene boots first
// (MenuScene today).
export function loadBgm(scene: Phaser.Scene): void {
    scene.load.audio(BGM_KEY, [
        'assets/sounds/musica_fondo.mp3',
        'assets/sounds/musica_fondo.ogg',
    ]);
}

// Lazily creates the single shared bgm Sound instance the first time any
// scene asks for it, and stashes it in the registry — same shared-instance-
// via-registry pattern GameManager already uses (see MainScene.ts's
// `registry.get('gameManager')` / `.set(...)`) — so every later call from
// any scene reuses that same instance instead of creating a second one.
export function getOrCreateBgm(scene: Phaser.Scene): Phaser.Sound.BaseSound {
    let bgm = scene.registry.get(BGM_KEY) as
        | Phaser.Sound.BaseSound
        | undefined;
    if (!bgm) {
        bgm = scene.sound.add(BGM_KEY, {
            loop: BGM_LOOP,
            volume: gameOptions.musicVolume ?? BGM_DEFAULT_VOLUME,
        });
        scene.registry.set(BGM_KEY, bgm);
    }
    return bgm;
}

export function playBgmIfNeeded(bgm: Phaser.Sound.BaseSound): void {
    if (!bgm.isPlaying) {
        bgm.play();
    }
}

// Applies a new volume to the shared bgm instance in-place (if it already
// exists — the volume control UI is DOM-level, in index.html/game.ts, and
// can run before any scene has created the Sound object yet, in which case
// there's nothing to update here; the value it saved to gameOptions still
// gets picked up above the next time getOrCreateBgm runs).
export function setBgmVolume(
    bgm: Phaser.Sound.BaseSound | undefined,
    volume: number
): void {
    // BaseSound itself declares no volume member at all (checked
    // phaser.d.ts) — only the concrete WebAudioSound/HTML5AudioSound
    // subclasses expose `.volume`, and the sound manager always returns one
    // of those two, never a bare BaseSound. Narrow cast to the union of the
    // two concrete types instead of `as any` so a real typo here would
    // still be caught.
    if (bgm) {
        (bgm as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound).volume =
            volume;
    }
}

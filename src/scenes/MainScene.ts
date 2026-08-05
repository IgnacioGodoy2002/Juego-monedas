import {
    Fruit,
    OrbTier,
    ORB_TIER_PREFIXES,
    ORB_TIER_COLORS,
    COIN_TIER_FILES,
    BLINK_COIN_FILES,
} from '../gameobjects/Fruit';
import { Player } from '../gameobjects/Player';
import { GameManager } from '../managers/GameManager';
import { getOrCreateBgm, playBgmIfNeeded } from '../managers/Bgm';
import { getSuraService } from '../integration/sura/SuraIntegrationService';
import { saveGameState } from '../storage';
import { GameControl, GameTheme } from '../types';
import {
    PLAY_AREA_WIDTH,
    PLAY_AREA_HEIGHT,
    PLAY_AREA_TOP_OFFSET,
    CANVAS_HEIGHT,
    HEADER_HEIGHT,
} from '../config/boardLayout';

const POINTS_PER_TIER = 5;
export const SUPERNOVA_CHAIN_BONUS = 300;
const SUPERNOVA_CLUSTER_SIZE = 3;

// Global throttle for the coin-collision sound — Matter can report dozens of
// contact pairs in a single step when a pile of coins settles, and playing
// one clip per pair turns into noise mush. One timestamp shared across every
// pair (instead of per-fruit) collapses all of those into a single sound.
const COLLISION_SOUND_COOLDOWN_MS = 70;

// Every custom event name ever registered on this.events, by MainScene
// itself (the this.events.on(...) calls throughout create()) or by
// HUDScene (this.mainScene.events.on(...) in HUDScene.ts — same emitter,
// see returnToMenu()'s 'shutdown' listener below). Used to clear *only*
// these specific events when returning to the menu — never a bare
// this.events.removeAllListeners() with no argument. That call clears
// EVERY event on this emitter, not just the game's own — including
// Phaser's own internal 'start'/'update'/'postupdate' subscriptions that
// MatterPhysics/TweenManager/Clock/Input/DisplayList rely on for their
// *entire* lifecycle, not just their one-time shutdown cleanup. Learned
// this the hard way: a bare removeAllListeners() here silently deletes
// MatterPhysics's own 'start' listener (the one that recreates
// this.matter.world after a shutdown), so the *second* "Jugar" click ever
// re-entered with a null Matter world and crashed on world.setBounds().
const MAIN_SCENE_CUSTOM_EVENT_NAMES = [
    'updateScore',
    'gameOver',
    'returnToMenu',
    'gameStarted',
    'moveLeft',
    'moveLeftStart',
    'moveLeftStop',
    'moveRight',
    'moveRightStart',
    'moveRightStop',
    'dropFruit',
    // Registered by HUDScene.ts, not MainScene.ts — included here because
    // this.mainScene.events there is this exact emitter.
    'gameInit',
    'tap',
    'win',
    'nextFruit',
    'supernovaChainReaction',
    'toggleHUD',
];

// Fruits above this Y trigger the game-over countdown; above this (but not
// yet the danger line) just pulses a soft warning. Both are anchored to the
// top of the *play rectangle*, not the top of the canvas — the jar's neck
// artwork occupies the space above PLAY_AREA_TOP_OFFSET.
const DANGER_ZONE_Y = PLAY_AREA_TOP_OFFSET + 100;
const WARNING_ZONE_Y = PLAY_AREA_TOP_OFFSET + 250;

// Measured from assets/jar/frasco1_transparent.png — replaces the old
// frasco.png (500x500, had a lid lying next to the jar that needed cropping
// out). The new source art (frasco1.png, 2048x2048) has no lid and no alpha
// channel at all (fully opaque, flat white background) — background was
// removed with a flood fill from the canvas edges (safe here since the
// jar's interior highlights are near-white but never touch the outer
// edge, so they're never connected to the exterior region the flood fill
// walks) and re-saved as frasco1_transparent.png.
//
// That flood-filled image was then downscaled from 2048 to 965px (a
// 460/976 ratio — 976 being the measured native body width) before
// measuring the numbers below. This matters because NineSlice's
// topHeight/bottomHeight render at literal, unscaled texture-pixel size
// regardless of the object's target width/height (see NineSlice.js
// updateVertices) — feeding it raw 2048-native measurements would have
// rendered a neck ~4x taller than intended. Pre-scaling the source file
// so its native pixels already match the intended on-screen size (like
// the original 500x500 asset happened to) avoids needing any extra scale
// correction in code here.
//
// Automated measurement (width-per-row scan, not eyeballed) on the
// 965x965 result: content spans y=89 to y=878, x=252 to x=712 (461px
// wide). The straight cylindrical body plateaus at 460px wide; that
// plateau first hits full width at y=321 and holds it through y=765.
const JAR_CONTENT_LEFT_NATIVE = 252;
const JAR_CONTENT_TOP_NATIVE = 89;
const JAR_BODY_WIDTH_NATIVE = 461;
const JAR_CONTENT_HEIGHT_NATIVE = 790; // 878 - 89 + 1
const JAR_NECK_HEIGHT_NATIVE = 232; // 321 - 89 — neck + shoulder, unscaled by NineSlice
const JAR_BASE_HEIGHT_NATIVE = 113; // 878 - 765 — rounded base, unscaled by NineSlice

// Merge burst — generated at runtime (see create()) instead of a shipped
// asset, since it's just a tinted dot; tint is set per-burst from
// ORB_TIER_COLORS so one texture covers every tier.
const MERGE_PARTICLE_TEXTURE_KEY = 'merge_particle_dot';

export class MainScene extends Phaser.Scene {
    private gameManager: GameManager;

    private elapsedTime: number;

    private keys: Map<string, Phaser.Input.Keyboard.Key>;

    private fruits: Phaser.GameObjects.Group;

    private touchCooldown: number = 0;
    private canTouch: boolean;
    private hasTouched: boolean;

    private dangerTimer: number = 0;
    private inDanger: boolean = false;

    private lastCollisionSoundTime: number = 0;
    private bgm: Phaser.Sound.BaseSound;

    private nextFruit: OrbTier;
    private highestFruit: OrbTier;

    private bar: Phaser.GameObjects.Image;
    private barTween: Phaser.Tweens.Tween;

    private player: Player;

    private controls: GameControl;

    // Only for debug
    private mergeDisabled: boolean = false;
    private heldNextFruit: OrbTier | null = null;

    // Live adjacency graph of Supernova-tier orbs currently touching each
    // other, keyed by Fruit.id — used to detect 3+ clusters for the chain
    // reaction explosion (Supernova has no fruitType + 1 to merge into).
    private supernovaContacts: Map<number, Set<number>> = new Map();
    private supernovaFruits: Map<number, Fruit> = new Map();

    // Bound once (not inline via .bind(this) at the .on() call site) so
    // returnToMenu() below can .off() these *exact* same references later.
    // this.game.events is the single Game-wide emitter, shared forever
    // across every scene restart — unlike this.events (this scene's own,
    // wiped wholesale by removeAllListeners()), nothing in Phaser ever
    // cleans this one up for you.
    private boundOnControlsChange = this.onControlsChange.bind(this);
    private boundOnThemeChange = this.onThemeChange.bind(this);

    constructor() {
        super({
            key: 'MainScene',
        });
    }

    preload(): void {
        this.load.image('bar', './assets/img/healthbar.png');
        this.load.image('player', './assets/img/Player.png');
        this.load.image('jar', './assets/jar/frasco1_transparent.png');
        this.load.audio('collision', [
            'assets/sounds/collision.mp3',
            'assets/sounds/collision.ogg',
        ]);
        // 'bgm' is loaded by MenuScene.preload() instead (it boots first —
        // see game.ts's scene array) — loading it again here would just
        // re-queue the same key, and the actual shared Sound instance
        // (see getOrCreateBgm below) needs it in the cache exactly once.
        this.keys = new Map([
            ['LEFT', this.input.keyboard.addKey('LEFT')],
            ['RIGHT', this.input.keyboard.addKey('RIGHT')],
            ['SPACE', this.input.keyboard.addKey('SPACE')],
        ]);
        if (debugEnabled) {
            this.keys.set('DEBUG_TOGGLE', this.input.keyboard.addKey('D'));
            this.keys.set('FRUIT_TOGGLE', this.input.keyboard.addKey('F'));
            this.keys.set('NEXT_FRUIT_HOLD', this.input.keyboard.addKey('G'));
            this.keys.set('MERGE_TOGGLE', this.input.keyboard.addKey('M'));
            this.keys.set('REMOVE_ALL_FRUIT', this.input.keyboard.addKey('R'));
            this.keys.set(
                'TOGGLE_DEBUG_CONTROLS',
                this.input.keyboard.addKey('Q')
            );
            this.keys.set('TOGGLE_OUTLINES', this.input.keyboard.addKey('W'));
            this.keys.set('TOGGLE_HUD', this.input.keyboard.addKey('E'));
        }
        // TODO: Could the themes not selected by user be loaded later?
        // TODO: Iterate all themes and load them
        this.loadTheme('fruit_basket');
        this.loadTheme('numbers');

        // Blink variants — one per tier in BLINK_COIN_FILES (10 of 12;
        // diamante and GG opted out, see Fruit.ts). Every file here is a
        // cleaned-up derivative, not the raw delivered upload — those came
        // in fully opaque (alpha 255 everywhere, background baked in
        // instead of real transparency, same issue the favicon source
        // had), so each one went through a flood-fill background removal
        // pass and a resize to match its normal texture's native
        // resolution exactly (see Fruit.ts's scheduleNextBlink() comment
        // for why that resolution match matters). Key follows the same
        // `${prefix}_${theme}` convention as loadTheme()'s real textures,
        // with a `_blink` suffix.
        for (const tierKey of Object.keys(BLINK_COIN_FILES)) {
            const tier = Number(tierKey) as OrbTier;
            this.load.image(
                `${ORB_TIER_PREFIXES[tier]}_fruit_basket_blink`,
                `./assets/coins/${BLINK_COIN_FILES[tier]}`
            );
        }
    }

    loadTheme(theme: GameTheme): void {
        for (let tier = OrbTier.Chispa; tier <= OrbTier.Supernova; tier++) {
            const key = `${ORB_TIER_PREFIXES[tier]}_${theme}`;
            if (this.textures.exists(key)) {
                continue;
            }
            this.load.image(key, `./assets/coins/${COIN_TIER_FILES[tier]}`);
        }
    }

    create(): void {
        this.createMergeParticleTexture();

        // Reuses the single shared instance MenuScene already created (and,
        // in practice, already started playing on the first menu button
        // click) instead of creating a second Sound object for the same
        // 'bgm' key — see managers/Bgm.ts.
        this.bgm = getOrCreateBgm(this);

        this.scene.launch('HUDScene');
        if (debugEnabled) {
            this.scene.launch('DebugScene');
        }

        this.gameManager = this.registry.get('gameManager');
        if (!this.gameManager) {
            this.gameManager = new GameManager(this);
            this.registry.set('gameManager', this.gameManager);
        }
        this.gameManager.init(gameState.highScore);
        this.events.on('updateScore', () => {
            this.gameManager.updateHighScore();
        });
        this.events.on('gameOver', () => {
            const sessionScore = this.registry.get('score');
            try {
                void getSuraService().completeGameSession({ score: sessionScore });
            } catch {
                // Service not initialised — standalone fallback, ignore.
            }
            this.gameManager.setGameOver(true);
            this.resetBoard();
        });

        // Emitted by HUDScene's pause overlay's "Volver al menú" button.
        // Ends the run the same way a game-over does (see resetBoard) but
        // skips the SURA session-completion call and the game-over screen
        // — the player is leaving on their own terms, not losing — then
        // tears this scene down for real via this.scene.stop() (see the
        // 'shutdown' listener below for why the actual listener cleanup
        // lives there instead of inline here).
        this.events.on('returnToMenu', () => {
            this.resetBoard();
            this.scene.stop();
        });

        // Phaser always fully shuts a scene down before it can be started
        // again (see SceneManager#start — there is no lighter-weight resume
        // path), so the *next* "Jugar" click re-runs create() from scratch.
        // Matter's world, every Tween (including each Fruit's idle wobble),
        // every Timer, and every GameObject this scene ever created (fruits,
        // player, the health bar) are already destroyed automatically by
        // Phaser's own per-plugin shutdown hooks — confirmed by reading
        // MatterPhysics/TweenManager/Clock/DisplayList's source, each one
        // listens for this scene's own 'shutdown' event and clears itself.
        //
        // The cleanup below has to happen in ITS OWN 'shutdown' listener,
        // registered here in create() — rather than inline in the
        // 'returnToMenu' handler above, before calling scene.stop().
        // this.events IS the same emitter Matter/Tweens/Clock/Input/
        // DisplayList each register their own SHUTDOWN cleanup on
        // (confirmed: Phaser's Systems.events and Scene.events are the same
        // injected EventEmitter plugin instance). Listeners for the same
        // event fire in registration order, and every one of those plugins
        // subscribes at scene boot/start — before create() ever runs — so
        // this listener (registered here, in create()) always fires after
        // theirs.
        //
        // Only clear the specific event names in MAIN_SCENE_CUSTOM_EVENT_
        // NAMES — never a bare this.events.removeAllListeners() with no
        // argument. Learned this the hard way in a real multi-cycle play →
        // pause → menu → replay browser test: a bare call also wipes
        // Phaser's own 'start' subscription that MatterPhysics relies on to
        // recreate this.matter.world after every shutdown, not just its
        // one-time SHUTDOWN cleanup — so the *second* return to MainScene
        // crashed with a null this.matter.world.
        this.events.once('shutdown', () => {
            this.game.events.off('controlsChange', this.boundOnControlsChange);
            this.game.events.off('themeChange', this.boundOnThemeChange);
            MAIN_SCENE_CUSTOM_EVENT_NAMES.forEach((eventName) =>
                this.events.removeAllListeners(eventName)
            );
        });
        this.events.on('gameStarted', () => {
            this.gameManager.setGameOver(false);
            this.gameManager.setDidWin(false);
            this.registry.set('beatHighscore', false);
        });
        this.events.on('moveLeft', () => {
            this.player.moveLeft();
        });
        this.events.on('moveLeftStart', () => {
            this.player.moveLeftStart();
            this.events.emit('debug', 'moveLeftHeld', true);
        });
        this.events.on('moveLeftStop', () => {
            this.player.moveLeftStop();
            this.events.emit('debug', 'moveLeftHeld', false);
        });
        this.events.on('moveRight', () => {
            this.player.moveRight();
        });
        this.events.on('moveRightStart', () => {
            this.player.moveRightStart();
            this.events.emit('debug', 'moveRightHeld', true);
        });
        this.events.on('moveRightStop', () => {
            this.player.moveRightStop();
            this.events.emit('debug', 'moveRightHeld', false);
        });
        this.events.on('dropFruit', (posX) => {
            if (!this.hasTouched || this.gameManager.isGameOver()) {
                this.registry.set('gameStarted', true);
                this.events.emit('gameStarted');
                this.hasTouched = true;

                // Normally already playing by now (started from the menu's
                // first button click), but this covers direct entry into
                // MainScene too, and the isPlaying guard (inside
                // playBgmIfNeeded) still prevents restarting the loop on
                // every subsequent game-over -> new game transition, since
                // this block re-runs then too.
                playBgmIfNeeded(this.bgm);

                try {
                    void getSuraService().startGameSession();
                } catch {
                    // Service not initialised — standalone fallback, ignore.
                }
            }
            this.events.emit('tap');
            // Place fruit
            if (this.canTouch) {
                const debugGraphics = this.add.graphics();
                const fruit = new Fruit(
                    this.matter.world,
                    posX,
                    PLAY_AREA_TOP_OFFSET + 20,
                    this.nextFruit,
                    debugGraphics
                );
                this.fruits.add(fruit, true);
                this.touchCooldown = 500;
                this.canTouch = false;
                this.setNextFruit(this.heldNextFruit);
            }
        });
        this.game.events.on('controlsChange', this.boundOnControlsChange);
        this.game.events.on('themeChange', this.boundOnThemeChange);

        // Decorative jar frame — added first so it renders behind everything
        // else (fruits, player, bar, HUD). Purely visual, does not touch
        // this.matter.world.setBounds() below.
        //
        // Crop out the transparent padding + the still-present lid art first
        // — shared by both the WebGL (NineSlice) and Canvas (plain Image)
        // paths below.
        this.textures.get('jar').add(
            'body',
            0,
            JAR_CONTENT_LEFT_NATIVE,
            JAR_CONTENT_TOP_NATIVE,
            JAR_BODY_WIDTH_NATIVE,
            JAR_CONTENT_HEIGHT_NATIVE
        );

        if (this.game.renderer.type === Phaser.WEBGL) {
            // NineSlice: neck+shoulder (top) and rounded base (bottom) stay
            // at native resolution — unscaled, per Phaser's NineSlice
            // semantics — while the straight-glass middle band stretches
            // vertically to fill whatever's left of the jar's height. No gap
            // under the base. NineSlice is WebGL-only as of Phaser 3.60,
            // hence the Canvas fallback below (type: Phaser.AUTO falls back
            // to Canvas on devices/WebViews without WebGL support, and we
            // have no way to confirm SURA's embedding WebView supports it).
            //
            // Starts at HEADER_HEIGHT instead of the canvas top (y=0) so the
            // opaque HUD header strip (see HUDScene.ts) doesn't paint over
            // the neck — PLAY_AREA_TOP_OFFSET is sized to exactly clear the
            // header + neck (see boardLayout.ts), so the jar's height here
            // is whatever's left below the header.
            const jarHeight = CANVAS_HEIGHT - HEADER_HEIGHT;
            this.add.nineslice(
                PLAY_AREA_WIDTH / 2,
                HEADER_HEIGHT + jarHeight / 2,
                'jar',
                'body',
                PLAY_AREA_WIDTH,
                jarHeight,
                0,
                0,
                JAR_NECK_HEIGHT_NATIVE,
                JAR_BASE_HEIGHT_NATIVE
            );
        } else {
            // Canvas fallback — NineSlice isn't available outside WebGL.
            // A plain, uniformly-scaled Image reintroduces the gap under
            // the base that NineSlice fixed (see the earlier investigation
            // when we first built this), but a wrongly-proportioned jar is
            // better than no jar at all.
            const jarFallbackScale = PLAY_AREA_WIDTH / JAR_BODY_WIDTH_NATIVE;
            const jar = this.add.image(
                PLAY_AREA_WIDTH / 2,
                HEADER_HEIGHT,
                'jar',
                'body'
            );
            jar.setOrigin(0.5, 0);
            jar.setScale(jarFallbackScale);
        }

        this.fruits = this.add.group({
            quantity: 0,
            maxSize: 0,
        });

        this.fruits.maxSize = -1;

        this.matter.world.setBounds(
            0,
            PLAY_AREA_TOP_OFFSET,
            PLAY_AREA_WIDTH,
            PLAY_AREA_HEIGHT,
            32,
            true,
            true,
            false,
            true
        );

        // Set up collision event for the group
        this.matter.world.on(
            'collisionstart',
            function (event) {
                if (this.mergeDisabled) {
                    return;
                }
                event.pairs.forEach(function (pair) {
                    const bodyA = pair.bodyA;
                    const bodyB = pair.bodyB;

                    // Check if bodies are in the group
                    if (
                        this.fruits.contains(bodyA.gameObject) &&
                        this.fruits.contains(bodyB.gameObject)
                    ) {
                        const fruit1 = bodyA.gameObject;
                        const fruit2 = bodyB.gameObject;

                        // Merge fruits if they're the same
                        if (fruit1.fruitType == fruit2.fruitType) {
                            // Supernova is the highest tier — there's no
                            // fruitType + 1 to create (this used to silently
                            // create a broken tier-8 orb). Link the two in
                            // the contact graph and let them bounce like a
                            // normal collision; a 3+ cluster explodes instead.
                            if (fruit1.fruitType === OrbTier.Supernova) {
                                this.linkSupernovaContact(fruit1, fruit2);
                                return;
                            }

                            const debugGraphics = this.add.graphics();
                            const fruit = new Fruit(
                                this.matter.world,
                                fruit1.x,
                                fruit1.y - 50,
                                fruit1.fruitType + 1,
                                debugGraphics
                            );
                            this.fruits.add(fruit, true);
                            this.fruits.remove(fruit1, true, true);
                            this.fruits.remove(fruit2, true, true);

                            this.emitMergeParticles(
                                fruit.x,
                                fruit.y,
                                fruit.fruitType
                            );

                            // Merge-only sound (not every coin-on-coin
                            // bounce). Cooldown kept in case a fast chain of
                            // merges in the same frame/tick would otherwise
                            // overlap several copies of the same clip.
                            const now = this.time.now;
                            if (
                                now - this.lastCollisionSoundTime >=
                                COLLISION_SOUND_COOLDOWN_MS
                            ) {
                                this.lastCollisionSoundTime = now;
                                this.sound.play('collision', { volume: 0.4 });
                            }

                            var score: number = this.registry.get('score');
                            score += POINTS_PER_TIER * (fruit1.fruitType + 1);
                            this.registry.set('score', score);
                            this.events.emit('updateScore');

                            if (fruit1.fruitType > this.highestFruit) {
                                this.highestFruit = fruit1.fruitType;
                            }

                            if (
                                fruit1.fruitType + 1 == OrbTier.Supernova &&
                                !this.gameManager.getDidWin()
                            ) {
                                this.events.emit('win');
                                this.gameManager.setDidWin(true);
                            }
                        }
                    }
                }, this);
            },
            this
        );

        // Supernova orbs that stop touching are unlinked from the contact
        // graph, so a cluster only ever counts orbs currently in contact.
        this.matter.world.on(
            'collisionend',
            function (event) {
                event.pairs.forEach(function (pair) {
                    const bodyA = pair.bodyA;
                    const bodyB = pair.bodyB;

                    if (
                        this.fruits.contains(bodyA.gameObject) &&
                        this.fruits.contains(bodyB.gameObject)
                    ) {
                        const fruit1 = bodyA.gameObject;
                        const fruit2 = bodyB.gameObject;

                        if (
                            fruit1.fruitType === OrbTier.Supernova &&
                            fruit2.fruitType === OrbTier.Supernova
                        ) {
                            this.unlinkSupernovaContact(fruit1, fruit2);
                        }
                    }
                }, this);
            },
            this
        );

        const barObj = new Phaser.GameObjects.Image(
            this,
            (game.config.width as number) / 2,
            PLAY_AREA_TOP_OFFSET + 100,
            'bar'
        );
        barObj.setScale(5, 1);
        this.add.existing(barObj);
        this.bar = barObj;
        this.bar.alpha = 0;

        // Enable input for the scene
        this.input.on('pointerup', (pointer) => {
            // Ignore touches at the bottom of the canvas in case someone is swiping out on iPhone
            if (pointer.y >= (game.config.height as number) - 100) {
                return;
            }
            this.events.emit(
                'dropFruit',
                this.controls === 'tap' ? pointer.x : this.player.x
            );
        });

        this.player = new Player(
            this,
            100,
            PLAY_AREA_TOP_OFFSET + 20,
            this.keys
        );
        this.add.existing(this.player);

        this.highestFruit = 0;
        this.setNextFruit(this.heldNextFruit);

        this.controls = gameOptions.controls;
        this.onControlsChange(this.controls);

        this.scene
            .get('HUDScene')
            .events.once('create', this.onHUDSceneCreate, this);
        if (debugEnabled) {
            this.scene
                .get('DebugScene')
                .events.once('create', this.onDebugSceneCreate, this);
        }

        this.registry.set('gameStarted', false);
    }

    // Shared by 'gameOver' (board overflowed) and 'returnToMenu' (player
    // quit voluntarily via the pause menu) — both end the current run the
    // same way: empty the jar, zero the score, let the next drop start
    // clean. What differs between the two callers is what happens *around*
    // this (game-over screen + SURA session completion vs. leaving the
    // scene entirely), not the reset itself.
    private resetBoard(): void {
        this.fruits.clear(true, true);
        this.supernovaContacts.clear();
        this.supernovaFruits.clear();
        this.registry.set('score', 0);
        this.registry.set('gameStarted', false);
        this.events.emit('updateScore');
        this.highestFruit = 0;
        this.setNextFruit(this.heldNextFruit);
        if (this.registry.get('beatHighscore')) {
            console.log('saving new high score to storage...');
            gameState.highScore = this.gameManager.getHighScore();
            saveGameState(gameState);
        }
    }

    private onThemeChange(): void {
        // Update the next fruit sprite to the new theme
        this.events.emit('nextFruit', this.nextFruit);
    }

    // Small tinted-dot texture for the merge burst — generated once instead
    // of shipped as an asset, since every tier just reuses it with a
    // different tint (see ORB_TIER_COLORS).
    createMergeParticleTexture(): void {
        if (this.textures.exists(MERGE_PARTICLE_TEXTURE_KEY)) {
            return;
        }

        const radius = 4;
        const graphics = this.add.graphics();
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(radius, radius, radius);
        graphics.generateTexture(
            MERGE_PARTICLE_TEXTURE_KEY,
            radius * 2,
            radius * 2
        );
        graphics.destroy();
    }

    // Brief particle burst at a normal merge (not the 3+ Supernova cluster
    // explosion, which keeps its own text popup). tier is the resulting
    // (merged-into) tier, so the burst color matches the orb that appears.
    emitMergeParticles(x: number, y: number, tier: OrbTier): void {
        this.add
            .particles(x, y, MERGE_PARTICLE_TEXTURE_KEY, {
                tint: ORB_TIER_COLORS[tier],
                lifespan: 400,
                speed: { min: 60, max: 160 },
                scale: { start: 1, end: 0 },
                quantity: 12,
                blendMode: 'ADD',
            })
            .explode(12);
    }

    linkSupernovaContact(fruit1: Fruit, fruit2: Fruit): void {
        this.supernovaFruits.set(fruit1.id, fruit1);
        this.supernovaFruits.set(fruit2.id, fruit2);

        if (!this.supernovaContacts.has(fruit1.id)) {
            this.supernovaContacts.set(fruit1.id, new Set());
        }
        if (!this.supernovaContacts.has(fruit2.id)) {
            this.supernovaContacts.set(fruit2.id, new Set());
        }
        this.supernovaContacts.get(fruit1.id).add(fruit2.id);
        this.supernovaContacts.get(fruit2.id).add(fruit1.id);

        this.checkSupernovaCluster(fruit1.id);
    }

    unlinkSupernovaContact(fruit1: Fruit, fruit2: Fruit): void {
        this.supernovaContacts.get(fruit1.id)?.delete(fruit2.id);
        this.supernovaContacts.get(fruit2.id)?.delete(fruit1.id);
    }

    findSupernovaCluster(startId: number): number[] {
        const visited = new Set<number>();
        const queue: number[] = [startId];
        visited.add(startId);

        while (queue.length > 0) {
            const currentId = queue.shift();
            const neighbors = this.supernovaContacts.get(currentId);
            if (!neighbors) {
                continue;
            }
            neighbors.forEach((neighborId) => {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push(neighborId);
                }
            });
        }

        return Array.from(visited);
    }

    checkSupernovaCluster(startId: number): void {
        let currentStart = startId;
        let cluster = this.findSupernovaCluster(currentStart);

        while (cluster.length >= SUPERNOVA_CLUSTER_SIZE) {
            this.explodeSupernovaCluster(cluster.slice(0, SUPERNOVA_CLUSTER_SIZE));

            const remaining = cluster.slice(SUPERNOVA_CLUSTER_SIZE);
            if (
                remaining.length === 0 ||
                !this.supernovaContacts.has(remaining[0])
            ) {
                break;
            }
            currentStart = remaining[0];
            cluster = this.findSupernovaCluster(currentStart);
        }
    }

    explodeSupernovaCluster(ids: number[]): void {
        const fruitsToExplode = ids
            .map((id) => this.supernovaFruits.get(id))
            .filter((fruit): fruit is Fruit => !!fruit);

        if (fruitsToExplode.length === 0) {
            return;
        }

        const avgX =
            fruitsToExplode.reduce((sum, fruit) => sum + fruit.x, 0) /
            fruitsToExplode.length;
        const avgY =
            fruitsToExplode.reduce((sum, fruit) => sum + fruit.y, 0) /
            fruitsToExplode.length;

        fruitsToExplode.forEach((fruit) => {
            this.supernovaContacts.delete(fruit.id);
            this.supernovaContacts.forEach((neighbors) => {
                neighbors.delete(fruit.id);
            });
            this.supernovaFruits.delete(fruit.id);
            this.fruits.remove(fruit, true, true);
        });

        var score: number = this.registry.get('score');
        score += SUPERNOVA_CHAIN_BONUS;
        this.registry.set('score', score);
        this.events.emit('updateScore');

        this.events.emit('supernovaChainReaction', { x: avgX, y: avgY });
    }

    onHUDSceneCreate(): void {
        this.events.emit('nextFruit', this.nextFruit);
        this.events.emit('gameInit');
    }

    onDebugSceneCreate(): void {
        this.events.emit('debug', 'moveLeftHeld', false);
        this.events.emit('debug', 'moveRightHeld', false);
        this.events.emit('debug', 'highscore', this.gameManager.getHighScore());
    }

    setNextFruit(nextFruit?: OrbTier): void {
        this.nextFruit = nextFruit || OrbTier.Chispa;
        if (nextFruit == null) {
            const randVal = Math.round(Math.random() * 4);
            if (randVal % 4 === 0 && this.highestFruit >= OrbTier.Nucleo) {
                this.nextFruit = OrbTier.Nucleo;
            } else if (
                randVal % 3 === 0 &&
                this.highestFruit >= OrbTier.Fragmento
            ) {
                this.nextFruit = OrbTier.Fragmento;
            } else if (
                randVal % 2 === 0 &&
                this.hasTouched &&
                !this.gameManager.isGameOver()
            ) {
                this.nextFruit = OrbTier.Destello;
            }
        }
        this.events.emit('nextFruit', this.nextFruit);
    }

    update(time: number, delta: number): void {
        this.elapsedTime += delta;
        if (!this.gameManager.isGameOver()) {
            this.fruits.children.entries.forEach((entry) => {
                const sprite = entry as Fruit;
                sprite.update(time, delta);
                if (sprite.lifetime > 1000) {
                    if (sprite.y < DANGER_ZONE_Y) {
                        if (!this.inDanger) {
                            this.dangerTimer = 2500;
                            this.inDanger = true;
                        }
                        this.pulsateImage(this.bar, 250);
                    } else if (sprite.y < WARNING_ZONE_Y && !this.inDanger) {
                        this.pulsateImage(this.bar, 500);
                    }
                }
            });
            if (
                !this.fruits.children.entries.some(
                    (entry: Fruit) =>
                        entry.lifetime > 1000 && entry.y < DANGER_ZONE_Y
                ) &&
                this.inDanger
            ) {
                this.inDanger = false;
                this.dangerTimer = 0;
                console.log('no longer in danger');
            }
        }

        if (this.dangerTimer <= 0 && this.inDanger) {
            this.events.emit('gameOver');
            if (this.barTween) {
                this.barTween.setFinishedState();
                this.bar.alpha = 0;
            }
            this.inDanger = false;
        } else {
            this.dangerTimer -= delta;
        }

        if (this.touchCooldown <= 0) {
            this.canTouch = true;
        } else {
            this.touchCooldown -= delta;
        }

        const debugKey = this.keys.get('DEBUG_TOGGLE');
        if (debugKey && this.input.keyboard.checkDown(debugKey, 1000)) {
            this.events.emit('debugToggle');
        }

        const changeFruitKey = this.keys.get('FRUIT_TOGGLE');
        if (
            changeFruitKey &&
            this.input.keyboard.checkDown(changeFruitKey, 1000)
        ) {
            this.setNextFruit(
                (this.nextFruit + 1) % (OrbTier.Supernova + 1)
            );
        }

        const nextFruitHoldKey = this.keys.get('NEXT_FRUIT_HOLD');
        if (
            nextFruitHoldKey &&
            this.input.keyboard.checkDown(nextFruitHoldKey, 1000)
        ) {
            if (!this.heldNextFruit) {
                this.heldNextFruit = this.nextFruit;
            } else {
                this.heldNextFruit = null;
            }
            this.events.emit(
                'debug',
                'heldNextFruit',
                this.heldNextFruit ? this.heldNextFruit.toString() : 'None'
            );
        }

        const mergeToggleKey = this.keys.get('MERGE_TOGGLE');
        if (
            mergeToggleKey &&
            this.input.keyboard.checkDown(mergeToggleKey, 1000)
        ) {
            this.mergeDisabled = !this.mergeDisabled;
            this.events.emit('debug', 'mergeDisabled', this.mergeDisabled);
        }

        const removeAllFruitKey = this.keys.get('REMOVE_ALL_FRUIT');
        if (
            removeAllFruitKey &&
            this.input.keyboard.checkDown(removeAllFruitKey, 1000)
        ) {
            this.fruits.clear(true, true);
            this.supernovaContacts.clear();
            this.supernovaFruits.clear();
        }

        const toggleControlsViewKey = this.keys.get('TOGGLE_DEBUG_CONTROLS');
        if (
            toggleControlsViewKey &&
            this.input.keyboard.checkDown(toggleControlsViewKey, 1000)
        ) {
            this.events.emit('debugControlsViewToggle');
        }

        const toggleOutlinesKey = this.keys.get('TOGGLE_OUTLINES');
        if (
            toggleOutlinesKey &&
            this.input.keyboard.checkDown(toggleOutlinesKey, 1000)
        ) {
            this.events.emit('debugOutlinesToggle');
        }

        const toggleHUDKey = this.keys.get('TOGGLE_HUD');
        if (toggleHUDKey && this.input.keyboard.checkDown(toggleHUDKey, 1000)) {
            this.events.emit('toggleHUD');
        }

        if (this.controls === 'move') {
            this.player.update(time, delta);
        }
    }

    pulsateImage(pulsatingImage, durationMS) {
        // If a pulsating effect is active currently, then do not make a new one until it finishes
        if (this.barTween && !this.barTween.isFinished()) {
            return;
        }

        // Create a tween for the pulsating effect
        this.barTween = this.tweens.add({
            targets: pulsatingImage,
            alpha: 1,
            duration: durationMS, // Total duration of the pulsating effect in milliseconds
            yoyo: true, // Yoyo makes the tween play back and forth
            repeat: 1, // Repeat only once
            onComplete: () => {
                this.barTween.setFinishedState();
            },
        });
    }

    onControlsChange(controls) {
        if (controls === 'move') {
            this.player.setVisible(true);
        } else {
            this.player.setVisible(false);
        }
        this.controls = controls;
    }
}

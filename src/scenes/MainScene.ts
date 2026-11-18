import { getSafeAreaInsetTop } from '../util/SafeArea';
import { CoinGameUI } from '../characters/CoinUI';
import { pairCircles, clampPairX, fitsPair, randomPairSpawnX, Circle } from '../gameobjects/PairGeometry';
import {
    Fruit,
    OrbTier,
    ORB_TIER_PREFIXES,
    ORB_TIER_COLORS,
    COIN_TIER_FILES,
    BLINK_COIN_FILES,
    ORB_TIER_HITBOX_FRACTIONS,
} from '../gameobjects/Fruit';
import { GameManager } from '../managers/GameManager';
import { getOrCreateBgm, playBgmIfNeeded } from '../managers/Bgm';
import { getSuraService } from '../integration/sura/SuraIntegrationService';
import { saveGameState } from '../storage';
import { GameTheme } from '../types';
import {
    PLAY_AREA_WIDTH,
    PLAY_AREA_HEIGHT,
    PLAY_AREA_TOP_OFFSET,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    HEADER_HEIGHT,
    LAUNCHER_HEIGHT,
} from '../config/boardLayout';
import { DEVICE_PIXEL_RATIO_REGISTRY_KEY } from '../util/HiDPI';

const POINTS_PER_TIER = 5;
export const SUPERNOVA_CHAIN_BONUS = 300;
const SUPERNOVA_CLUSTER_SIZE = 3;

// How fast A/D (or LEFT/RIGHT) steer the falling coin, in world px per ms —
// tuned to feel roughly as responsive as the old walking Player character
// did (its xSpeed was 5px/frame at ~60fps, i.e. ~0.3px/ms).
const ACTIVE_FRUIT_MOVE_SPEED = 0.5;

// "Landed" detection for the currently-falling coin: any collisionstart of
// its body against the jar's floor (this.matter.world.walls.bottom) or
// against any other coin. A side-wall bump doesn't count — it doesn't stop
// the coin's descent, it's just steering hitting a limit — so left/right
// are deliberately excluded. An earlier version tried to infer "landed"
// from the coin's own vertical velocity settling near zero instead, but a
// coin rebuilt against Matter's resting-contact stack of other coins keeps
// enough residual jitter from the solver's own correction pass that it
// routinely never dropped below any sane epsilon — the practical result
// was a coin that never handed off control unless it happened to merge,
// staying draggable across the whole board indefinitely. A direct
// collision check has no such tuning problem.
//
// Small pause between a coin landing and the next one appearing — purely
// so the transition reads as a discrete "turn" instead of an instant swap.
const NEXT_FRUIT_SPAWN_DELAY_MS = 150;

// Newly-spawned coin hovers in place (gravity off, but still steerable)
// for this long before it actually starts falling — gives the player a
// beat to see it and line up a move before it's live, instead of it
// snapping straight into freefall the instant it appears.
const PRE_FALL_HOVER_MS = 350;

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
    'restartAfterGameOver',
    'returnToMenu',
    'gameStarted',
    // Registered by HUDScene.ts, not MainScene.ts — included here because
    // this.mainScene.events there is this exact emitter.
    'gameInit',
    'tap',
    'win',
    'nextFruit',
    'supernovaChainReaction',
    'toggleHUD',
];

// Residual-penetration cleanup (resolveCoinOverlaps()). Matter's position
// solver is iterative and approximate — even at the raised iteration counts
// set in game.ts it can leave a coin visibly sunk into its neighbours when
// the jar is packed, because the pile's contacts are solved in sequence and
// the last few passes run out before every one of them has been separated.
// This is a cheap post-step pass that finishes the job for the pairs the
// solver gave up on. It is deliberately gentle:
//   SLACK           — penetration below this is ignored. Matter's own
//                     resting contacts legitimately sit a fraction of a
//                     pixel deep (body.slop defaults to 0.05), and
//                     correcting those every frame is how you get a pile
//                     that buzzes instead of resting.
//   RELAXATION      — fraction of the remaining overlap removed per frame.
//                     Correcting 100% in one step fights the solver and
//                     makes coins pop; easing it out over a few frames is
//                     invisible.
//   MAX_CORRECTION  — hard ceiling per pair per frame, so the one genuinely
//                     deep case (a merge product appearing inside the pile)
//                     resolves as a push rather than a teleport.
const COIN_OVERLAP_SLACK = 1;
const COIN_OVERLAP_RELAXATION = 0.4;
const COIN_OVERLAP_MAX_CORRECTION = 6;

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

    private hasTouched: boolean;

    // The coin currently falling and under player control — null between a
    // landing and the next one spawning (see handleActiveFruitLanded()/
    // spawnActiveFruit()). Distinct from previewFruit below: this is a real
    // physics body already in this.fruits, previewFruit is just the tier
    // shown in the HUD's "Siguiente" panel for the one after it.
    private activeFruit: Fruit | null = null;
    private previewFruit: OrbTier;
    private pendingSpawnTimer: Phaser.Time.TimerEvent | null = null;

    private dangerTimer: number = 0;
    private inDanger: boolean = false;

    private lastCollisionSoundTime: number = 0;

    // Wall-clock timestamp of the first drop this session — sent to SURA
    // alongside the score so its anti-cheat can bound score against elapsed
    // time (same duration_ms field the other two games' GAME_COMPLETE send).
    private sessionStartedAt: number | null = null;
    private bgm: Phaser.Sound.BaseSound;

    private highestFruit: OrbTier;

    private bar: Phaser.GameObjects.Image;
    private barTween: Phaser.Tweens.Tween;

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
    private boundOnThemeChange = this.onThemeChange.bind(this);
    // this.scale is the Game-wide ScaleManager (shared across scene
    // restarts like this.game.events above), so this needs the same
    // bound-handler + explicit .off() on shutdown as boundOnThemeChange, or
    // every replay cycle would stack another duplicate listener.
    private boundOnResize = this.onResize.bind(this);

    constructor() {
        super({
            key: 'MainScene',
        });
    }

    preload(): void {
        this.load.image('bar', './assets/img/healthbar.png');
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
            // Arrow keys kept as a free alias alongside A/D — same intent,
            // no reason to only accept one pair.
            ['LEFT', this.input.keyboard.addKey('LEFT')],
            ['RIGHT', this.input.keyboard.addKey('RIGHT')],
            ['A', this.input.keyboard.addKey('A')],
            ['D', this.input.keyboard.addKey('D')],
        ]);
        if (debugEnabled) {
            // Used to be bound to 'D' too, back when D wasn't already
            // spoken for by movement — now that D steers the falling coin,
            // reusing it here would make the same keypress both toggle the
            // debug overlay and move the active coin right every time.
            this.keys.set('DEBUG_TOGGLE', this.input.keyboard.addKey('V'));
            this.keys.set('FRUIT_TOGGLE', this.input.keyboard.addKey('F'));
            this.keys.set('NEXT_FRUIT_HOLD', this.input.keyboard.addKey('G'));
            this.keys.set('MERGE_TOGGLE', this.input.keyboard.addKey('M'));
            this.keys.set('REMOVE_ALL_FRUIT', this.input.keyboard.addKey('BACKSPACE'));
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
        this.hasTouched=false;this.inDanger=false;this.dangerTimer=0;this.sessionStartedAt=null;this.rotateWasDown=false;this.dragLastX=null;this.lastSpawnX=null;
        this.createMergeParticleTexture();
        this.updateCameraFit();

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
            const durationMs = this.sessionStartedAt !== null
                ? Date.now() - this.sessionStartedAt
                : undefined;
            try {
                void getSuraService().completeGameSession({ score: sessionScore, durationMs });
            } catch {
                // Service not initialised — standalone fallback, ignore.
            }
            this.gameManager.setGameOver(true);
            // No resetBoard() here anymore — used to wipe the jar and the
            // score display the instant the danger timer ran out, before
            // the player had any real acknowledgement they'd lost (see
            // HUDScene.ts's game-over overlay, which now owns pausing this
            // scene and showing the final board/score until the player
            // picks "Jugar de nuevo" or "Volver al menú"). The board stays
            // exactly as it was until one of those fires the matching
            // event below.
        });

        // Emitted by HUDScene's game-over overlay's "Jugar de nuevo"
        // button — same reset as the old automatic one used to do, just
        // deferred until the player actually asks for a new round instead
        // of firing the instant the previous one ended.
        this.events.on('restartAfterGameOver', () => {
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
            this.game.events.off('themeChange', this.boundOnThemeChange);
            this.scale.off('resize', this.boundOnResize);
            MAIN_SCENE_CUSTOM_EVENT_NAMES.forEach((eventName) =>
                this.events.removeAllListeners(eventName)
            );
        });
        this.scale.on('resize', this.boundOnResize);
        this.events.on('gameStarted', () => {
            this.gameManager.setGameOver(false);
            this.gameManager.setDidWin(false);
            this.registry.set('beatHighscore', false);
        });
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
            const jarHeight = CANVAS_HEIGHT - HEADER_HEIGHT - LAUNCHER_HEIGHT;
            this.add.nineslice(
                PLAY_AREA_WIDTH / 2,
                HEADER_HEIGHT + LAUNCHER_HEIGHT + jarHeight / 2,
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
                HEADER_HEIGHT + LAUNCHER_HEIGHT,
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
                    if(bodyA.isSensor || bodyB.isSensor)return;

                    // Check if bodies are in the group
                    if (
                        this.fruits.contains(bodyA.gameObject) &&
                        this.fruits.contains(bodyB.gameObject)
                    ) {
                        this.tryMergeFruits(
                            bodyA.gameObject,
                            bodyB.gameObject
                        );
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

        // World-space position (fixed logical board — see updateCameraFit()),
        // not screen space, so PLAY_AREA_WIDTH replaces the old
        // `game.config.width` (which under Scale.RESIZE stays frozen at its
        // boot-time value and no longer represents anything live anyway).
        const barObj = new Phaser.GameObjects.Image(
            this,
            PLAY_AREA_WIDTH / 2,
            PLAY_AREA_TOP_OFFSET + 100,
            'bar'
        );
        barObj.setScale(5, 1);
        this.add.existing(barObj);
        this.bar = barObj;
        this.bar.alpha = 0;

        this.highestFruit = 0;
        this.previewFruit = this.pickNextTier(this.heldNextFruit);
        this.previewMate = ((this.previewFruit+1)%4) as OrbTier;
        this.events.emit('nextFruit', this.previewFruit);

        this.scene
            .get('HUDScene')
            .events.once('create', this.onHUDSceneCreate, this);
        if (debugEnabled) {
            this.scene
                .get('DebugScene')
                .events.once('create', this.onDebugSceneCreate, this);
        }

        this.registry.set('gameStarted', false);
        this.pairLink=this.add.graphics().setDepth(-1);
        this.coinUI=new CoinGameUI(()=>this.rotatePair());
        const rotateKey=this.input.keyboard.addKey('R');this.keys.set('PAIR_ROTATE',rotateKey);
        this.keys.set('PAIR_ROTATE_UP',this.input.keyboard.addKey('UP'));
        const onPairPause=()=>this.coinUI.setEnabled(false),onPairResume=()=>this.coinUI.setEnabled(true);
        this.events.on('pause',onPairPause);this.events.on('resume',onPairResume);
        this.events.once('shutdown',()=>{this.events.off('pause',onPairPause);this.events.off('resume',onPairResume);});
        this.events.once('shutdown',()=>{this.coinUI.destroy();this.pairMate=null;this.activeFruit=null;this.pendingSpawnTimer=null;});
        this.time.delayedCall(120,()=>this.ensureGameStarted());
    }

    // Shared by 'gameOver' (board overflowed) and 'returnToMenu' (player
    // quit voluntarily via the pause menu) — both end the current run the
    // same way: empty the jar, zero the score, let the next drop start
    // clean. What differs between the two callers is what happens *around*
    // this (game-over screen + SURA session completion vs. leaving the
    // scene entirely), not the reset itself.
    private resetBoard(): void {
        this.gameManager.setGameOver(false);
        this.fruits.clear(true, true);
        this.supernovaContacts.clear();
        this.supernovaFruits.clear();
        this.registry.set('score', 0);
        this.registry.set('gameStarted', false);
        this.events.emit('updateScore');
        this.highestFruit = 0;
        this.activeFruit = null;
        this.pairMate = null;
        this.pairLink?.clear();
        this.hasTouched = false;this.inDanger=false;this.dangerTimer=0;this.sessionStartedAt=null;
        this.time.delayedCall(150,()=>{if(this.scene.isActive())this.ensureGameStarted()});
        // A landing right as the game ended could still have a spawn
        // scheduled — cancel it so a stray coin doesn't appear over the
        // freshly-cleared board a moment after resetBoard() runs.
        this.pendingSpawnTimer?.remove();
        this.pendingSpawnTimer = null;
        this.previewFruit = this.pickNextTier(this.heldNextFruit);
        this.events.emit('nextFruit', this.previewFruit);
        if (this.registry.get('beatHighscore')) {
            console.log('saving new high score to storage...');
            gameState.highScore = this.gameManager.getHighScore();
            saveGameState(gameState);
        }
    }

    private onThemeChange(): void {
        // Update the next fruit sprite to the new theme
        this.events.emit('nextFruit', this.previewFruit);
    }

    private onResize(gameSize: Phaser.Structs.Size): void {
        console.log(
            '[MainScene] resize ->',
            gameSize.width,
            gameSize.height
        );
        this.updateCameraFit();
    }

    // Phaser zooms around the viewport center. Keep the entire jar inside
    // the play canvas, below the HUD, using centerOn rather than a raw scroll.
    private updateCameraFit(): void {
        if (!this.scale.width || !this.scale.height) return;
        const dpr=this.registry.get(DEVICE_PIXEL_RATIO_REGISTRY_KEY)||1;
        const camera=this.cameras.main;
        const header=80+getSafeAreaInsetTop();
        const zoom=Math.min(Math.max(1,this.scale.height-header)/(CANVAS_HEIGHT-HEADER_HEIGHT),this.scale.width/CANVAS_WIDTH)*.94*dpr;
        camera.setSize(this.scale.width*dpr,this.scale.height*dpr);
        camera.setZoom(zoom);
        camera.centerOn(CANVAS_WIDTH/2, HEADER_HEIGHT+(camera.height/2-header*dpr)/zoom);
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
        this.events.emit('nextFruit', this.previewFruit);
        this.events.emit('gameInit');
    }

    onDebugSceneCreate(): void {
        this.events.emit('debug', 'highscore', this.gameManager.getHighScore());
    }

    // Pure tier picker — same probability ladder the old setNextFruit() used
    // (weighted by how far the player has progressed, via highestFruit), but
    // returning a value instead of assigning this.nextFruit directly. Used
    // both for the coin about to be spawned and for the HUD's "Siguiente"
    // preview one step ahead of it. `forced` (from the debug G-key's
    // heldNextFruit) short-circuits the randomness when set — `!= null`
    // deliberately, so a forced Chispa (tier 0) isn't mistaken for "no
    // override" the way `forced || default` would.
    private pickNextTier(forced?: OrbTier | null): OrbTier {
        if (forced != null) {
            return forced;
        }
        const randVal = Math.round(Math.random() * 4);
        if (randVal % 4 === 0 && this.highestFruit >= OrbTier.Nucleo) {
            return OrbTier.Nucleo;
        }
        if (randVal % 3 === 0 && this.highestFruit >= OrbTier.Fragmento) {
            return OrbTier.Fragmento;
        }
        if (
            randVal % 2 === 0 &&
            this.hasTouched &&
            !this.gameManager.isGameOver()
        ) {
            return OrbTier.Destello;
        }
        return OrbTier.Chispa;
    }

    private pairMate: Fruit | null = null;
    private pairX = 0;
    private pairY = 0;
    private pairAngle = 0;
    private pairRadii: number[] = [];
    private previewMate: OrbTier = OrbTier.Destello;
    private lastSpawnX: number | null = null;
    private dragLastX: number | null = null;
    private coinUI: CoinGameUI;
    private pairLink: Phaser.GameObjects.Graphics;
    private rotateWasDown = false;

    private spawnActiveFruit(): void {
        const tiers = [this.previewFruit, this.previewMate];
        this.pairAngle = 0;
        this.pairY = HEADER_HEIGHT + LAUNCHER_HEIGHT - 12;
        this.pairX = PLAY_AREA_WIDTH/2;
        const coins = tiers.map(tier => {
            const coin = new Fruit(this.matter.world, this.pairX, this.pairY, tier, this.add.graphics());
            coin.setStatic(true).setSensor(true).setIgnoreGravity(true);
            this.fruits.add(coin, true);
            return coin;
        });
        this.activeFruit = coins[0]; this.pairMate = coins[1];
        this.pairRadii = coins.map(c => (c.body as MatterJS.BodyType).circleRadius);
        this.pairX = randomPairSpawnX(PLAY_AREA_WIDTH,this.pairRadii,this.lastSpawnX);
        this.lastSpawnX=this.pairX;this.dragLastX=null;
        this.placePair();
        this.previewFruit = this.pickNextTier(this.heldNextFruit);
        this.previewMate = this.pickNextTier();
        if(this.previewMate === this.previewFruit) this.previewMate = ((this.previewFruit + 1) % 4) as OrbTier;
        this.events.emit('nextFruit', this.previewFruit);
        this.coinUI?.preview([COIN_TIER_FILES[this.previewFruit], COIN_TIER_FILES[this.previewMate]]);
        this.coinUI?.toss();
    }

    private pairObstacles(): Circle[] {
        return this.fruits.getChildren().filter(c=>c!==this.activeFruit&&c!==this.pairMate&&c.active).map((c:Fruit)=>({x:c.x,y:c.y,r:(c.body as MatterJS.BodyType).circleRadius}));
    }
    private validPair(x:number,y:number,angle:number):boolean {
        return fitsPair(pairCircles(x,y,angle,this.pairRadii),this.pairObstacles(),PLAY_AREA_WIDTH,PLAY_AREA_TOP_OFFSET+PLAY_AREA_HEIGHT);
    }
    private placePair():void {
        if(!this.activeFruit || !this.pairMate)return;
        const shape=pairCircles(this.pairX,this.pairY,this.pairAngle,this.pairRadii);
        [this.activeFruit,this.pairMate].forEach((c,i)=>c.setPosition(shape[i].x,shape[i].y));
        this.pairLink?.clear().lineStyle(5,0xffde89,.65).lineBetween(shape[0].x,shape[0].y,shape[1].x,shape[1].y);
        this.coinUI?.aim((this.pairX/PLAY_AREA_WIDTH-.5)*2);
    }
    private rotatePair():void {
        if(!this.activeFruit||this.gameManager.isGameOver()||!this.scene.isActive())return;
        const angle=this.pairAngle+Math.PI/2;
        const x=clampPairX(this.pairX,angle,this.pairRadii,PLAY_AREA_WIDTH);
        for(const kick of [0,-18,18,-36,36]){
            const nx=clampPairX(x+kick,angle,this.pairRadii,PLAY_AREA_WIDTH);
            if(this.validPair(nx,this.pairY,angle)){this.pairAngle=angle;this.pairX=nx;this.placePair();return;}
        }
    }
    private movePairTo(x:number):void {
        if(!this.activeFruit)return;
        const target=clampPairX(x,this.pairAngle,this.pairRadii,PLAY_AREA_WIDTH);
        const distance=target-this.pairX;const steps=Math.max(1,Math.ceil(Math.abs(distance)/6));
        for(let i=0;i<steps;i++){const nx=this.pairX+distance/steps;if(!this.validPair(nx,this.pairY,this.pairAngle))break;this.pairX=nx;}
        this.placePair();
    }
    private fallPair(distance:number):void {
        if(!this.activeFruit)return;
        const steps=Math.max(1,Math.ceil(distance/4));
        for(let i=0;i<steps;i++){
            if(!this.validPair(this.pairX,this.pairY+distance/steps,this.pairAngle)){this.releasePair();return;}
            this.pairY+=distance/steps;
        }
        this.placePair();
    }
    private releasePair():void {
        if(!this.activeFruit || !this.pairMate)return;
        this.placePair();
        const coins=[this.activeFruit,this.pairMate];this.activeFruit=null;this.pairMate=null;this.pairLink?.clear();
        coins.forEach(c=>{c.setStatic(false).setSensor(false).setIgnoreGravity(false).setVelocityY(2);c.lifetime=0});
        this.pendingSpawnTimer=this.time.delayedCall(190,()=>{this.pendingSpawnTimer=null;if(!this.gameManager.isGameOver())this.spawnActiveFruit()});
    }

    // Runs on the first real player input (A/D/arrow press, or a
    // touch/click on the board) each round — mirrors what the old
    // 'dropFruit' handler's first-touch branch used to do (kick off bgm,
    // the SURA session, the "tap to play" HUD copy), plus spawning the very
    // first falling coin. Safe to call every frame input is held: once a
    // coin is live (this.activeFruit) or the next one is already queued up
    // (this.pendingSpawnTimer, the brief gap after a landing — see
    // handleActiveFruitLanded), the spawn is skipped. That second guard
    // matters — without it, holding a direction key through that gap used
    // to race the queued spawn and produce two coins at once, one from
    // here and one from the timer.
    private ensureGameStarted(): void {
        if(this.gameManager.isGameOver())return;
        if (!this.hasTouched) {
            this.registry.set('gameStarted', true);
            this.events.emit('gameStarted');
            this.hasTouched = true;
            playBgmIfNeeded(this.bgm);
            this.sessionStartedAt = Date.now();
            try {
                void getSuraService().startGameSession();
            } catch {
                // Service not initialised — standalone fallback, ignore.
            }
        }
        this.events.emit('tap');
        if (
            !this.activeFruit &&
            !this.pendingSpawnTimer &&
            !this.gameManager.isGameOver()
        ) {
            this.spawnActiveFruit();
        }
    }

    // Steers the active coin toward the player's finger/mouse while a
    // pointer is held down over the board — screen-to-world conversion via
    // getWorldPoint() is the same pattern the old tap-to-drop path used
    // (see git history), needed because the camera zooms to cover the real
    // canvas (updateCameraFit()) so screen space and world space no longer
    // share coordinates once zoom != 1.
    private updateActiveFruitFromPointer(pointer: Phaser.Input.Pointer): void {
        if(!this.activeFruit||!pointer.isDown){this.dragLastX=null;return;}
        const dpr=this.registry.get(DEVICE_PIXEL_RATIO_REGISTRY_KEY)||1;
        if(pointer.y<85*dpr||pointer.y>=this.scale.height*dpr){this.dragLastX=null;return;}
        const worldX=this.cameras.main.getWorldPoint(pointer.x,pointer.y).x;
        // Relative drag: only a new movement steers the current pair.
        // Holding the finger/mouse still never snaps the next pair to it.
        if(this.dragLastX!==null&&Math.abs(worldX-this.dragLastX)>.001)this.movePairTo(this.pairX+(worldX-this.dragLastX));
        this.dragLastX=worldX;
    }
    private updateActiveFruitKeyboardControl(delta:number):void {
        const left=this.keys.get('A')?.isDown||this.keys.get('LEFT')?.isDown;
        const right=this.keys.get('D')?.isDown||this.keys.get('RIGHT')?.isDown;
        const direction=(right?1:0)-(left?1:0);
        if(direction)this.movePairTo(this.pairX+Math.sign(direction)*.65*delta);
    }

    // Merge detection cannot rely on 'collisionstart' alone. Matter emits
    // that event once, when a pair of bodies *becomes* active: a pair that
    // is already touching never re-fires it. Two ways a same-tier pair ends
    // up permanently overlapped and unfused because of that:
    //
    //   - The coin being aimed is static + sensor while it hangs at the
    //     launcher (see spawnActiveFruit). Its sensor contacts are discarded
    //     by the handler above, and by the time releasePair() turns it
    //     dynamic the pair is already active in Matter's table, so no
    //     further event ever arrives for it. This is why the bug only shows
    //     up "after a while": it needs the pile to have grown up to the
    //     launcher.
    //   - resolveCoinOverlaps() separates deeply-sunk coins by moving them
    //     with the Matter transform, which likewise does not re-activate an
    //     already-active pair.
    //
    // So the same merge is now reachable from two places: the event (normal
    // path, fires the instant two coins touch) and a per-frame overlap scan
    // in resolveCoinOverlaps() (backstop for the pairs above). Returns true
    // when the pair was consumed — merged, or linked as a Supernova contact
    // — in which case the caller must not touch fruit1/fruit2 again.
    private tryMergeFruits(fruit1: Fruit, fruit2: Fruit): boolean {
        if (this.mergeDisabled) return false;
        if (!fruit1 || !fruit2 || fruit1 === fruit2) return false;
        if (!fruit1.active || !fruit2.active) return false;
        if (!this.fruits.contains(fruit1) || !this.fruits.contains(fruit2)) {
            return false;
        }
        if (fruit1.fruitType !== fruit2.fruitType) return false;

        const body1 = fruit1.body as MatterJS.BodyType;
        const body2 = fruit2.body as MatterJS.BodyType;
        if (!body1 || !body2) return false;
        // The pair still being aimed is placed by placePair(), not by the
        // solver — it must never fuse before it is released.
        if (
            body1.isStatic ||
            body1.isSensor ||
            body2.isStatic ||
            body2.isSensor
        ) {
            return false;
        }

        // Supernova is the highest tier — there's no
        // fruitType + 1 to create (this used to silently
        // create a broken tier-8 orb). Link the two in
        // the contact graph and let them bounce like a
        // normal collision; a 3+ cluster explodes instead.
        if (fruit1.fruitType === OrbTier.Supernova) {
            this.linkSupernovaContact(fruit1, fruit2);
            return true;
        }

        const debugGraphics = this.add.graphics();
        // Midpoint of the two parents, not fruit1's own
        // position lifted by a flat 50px. That old
        // offset was a blind upward shove: the merge
        // product is a whole tier bigger than either
        // parent, so teleporting it 50px up planted it
        // straight inside whatever coins were resting on
        // top of the pair — deep, instant interpenetration
        // that the solver then had to dig its way out of
        // (and often couldn't, in a packed jar). The
        // midpoint is the one spot already guaranteed to
        // be mostly clear: it's the space the two parents
        // just vacated.
        const fruit = new Fruit(
            this.matter.world,
            (fruit1.x + fruit2.x) / 2,
            (fruit1.y + fruit2.y) / 2,
            fruit1.fruitType + 1,
            debugGraphics
        );
        // The merge product is bigger than either parent
        // — spawning it at fruit1.x unclamped let its own
        // (larger) radius already overlap a wall or a
        // neighboring coin the instant it appeared,
        // unlike the tap-to-drop path a few lines up in
        // this file, which has always clamped by its
        // own radius. Most visible on the 5 largest
        // merge-product tiers (Esmeralda/Reina/Zafiro/
        // OrbeSolar/Supernova, radius 108-151px) —
        // confirmed via a real 6-zafiro-at-the-wall
        // repro that produced a merged OrbeSolar with
        // its hitbox circle ~10px past the left wall.
        const newRadius =
            (fruit.displayWidth / 2) *
            ORB_TIER_HITBOX_FRACTIONS[fruit.fruitType];
        const clampedX = Phaser.Math.Clamp(
            fruit.x,
            newRadius,
            PLAY_AREA_WIDTH - newRadius
        );
        // Same reasoning for the floor: merging two
        // coins resting on the bottom puts the midpoint
        // at their shared center height, which for the
        // bigger product is already below the floor.
        const clampedY = Math.min(
            fruit.y,
            PLAY_AREA_TOP_OFFSET +
                PLAY_AREA_HEIGHT -
                newRadius
        );
        if (clampedX !== fruit.x || clampedY !== fruit.y) {
            fruit.setPosition(clampedX, clampedY);
        }
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
            // The highest coin continues playing: three GG coins clear space.
            this.gameManager.setDidWin(true);
        }
        return true;
    }

    // Nudges apart any two coins the physics solver left interpenetrating.
    // Runs from update(), which Phaser calls *after* it has emitted the
    // scene UPDATE event that steps the Matter world, so this sees the
    // post-step positions and its corrections land in the same frame's
    // render. Positions are moved via the Matter transform (Body.setPosition
    // with no velocity update), which shifts positionPrev by the same delta
    // — so separating the pair adds no energy and the coins keep whatever
    // velocity they had.
    //
    // O(n^2) over the coins on the board, which the jar hard-caps at a few
    // dozen — a couple of hundred distance checks a frame.
    private resolveCoinOverlaps(): void {
        const coins = this.fruits.getChildren() as Fruit[];
        const floor = PLAY_AREA_TOP_OFFSET + PLAY_AREA_HEIGHT;
        // Same-tier pairs found overlapping here have to fuse, not be pushed
        // apart — see tryMergeFruits() for why 'collisionstart' misses some
        // of them entirely. The merge itself destroys both coins and adds a
        // third, which would invalidate this iteration, so the pairs are
        // collected and applied once the scan is done. `claimed` keeps a
        // coin out of two merges in the same frame.
        const pendingMerges: [Fruit, Fruit][] = [];
        const claimed = new Set<Fruit>();

        for (let i = 0; i < coins.length; i++) {
            const coinA = coins[i];
            const bodyA = coinA?.body as MatterJS.BodyType;
            // Static/sensor skips the pair still being aimed at the top of
            // the board: it is placed by placePair(), not by the solver, and
            // must not be shoved around by the pile underneath it.
            if (!coinA?.active || !bodyA || bodyA.isStatic || bodyA.isSensor) {
                continue;
            }

            for (let j = i + 1; j < coins.length; j++) {
                const coinB = coins[j];
                const bodyB = coinB?.body as MatterJS.BodyType;
                if (
                    !coinB?.active ||
                    !bodyB ||
                    bodyB.isStatic ||
                    bodyB.isSensor
                ) {
                    continue;
                }

                let dx = coinB.x - coinA.x;
                let dy = coinB.y - coinA.y;
                let distance = Math.hypot(dx, dy);
                const contactDistance =
                    bodyA.circleRadius + bodyB.circleRadius;

                // Two coins of the same rarity in contact are a merge, at
                // any depth — the threshold is plain contact, not the
                // separation slack below (a resting contact legitimately
                // sits a fraction of a pixel deep, and that is still a
                // touch). Supernova is excluded: it has no higher tier to
                // fuse into, its clusters are handled by the contact graph,
                // so an overlapped Supernova pair still gets separated.
                if (
                    distance <= contactDistance &&
                    coinA.fruitType === coinB.fruitType &&
                    coinA.fruitType !== OrbTier.Supernova &&
                    !claimed.has(coinA) &&
                    !claimed.has(coinB)
                ) {
                    claimed.add(coinA);
                    claimed.add(coinB);
                    pendingMerges.push([coinA, coinB]);
                    continue;
                }

                const overlap = contactDistance - distance - COIN_OVERLAP_SLACK;
                if (overlap <= 0) {
                    continue;
                }

                // Exactly concentric (two coins spawned at the same point)
                // leaves no contact normal to push along. Pick straight up,
                // so the separation is gravity-aligned and the lower coin
                // settles back down naturally, rather than an arbitrary
                // sideways direction.
                if (distance < 1e-6) {
                    dx = 0;
                    dy = -1;
                    distance = 1;
                }
                const normalX = dx / distance;
                const normalY = dy / distance;
                const push =
                    Math.min(overlap, COIN_OVERLAP_MAX_CORRECTION) *
                    COIN_OVERLAP_RELAXATION;

                // Split by inverse mass, same as the solver would: a Chispa
                // pinched under a Supernova is the one that gets moved, not
                // the whole pile resting on top of it.
                const inverseTotal = bodyA.inverseMass + bodyB.inverseMass;
                if (inverseTotal <= 0) {
                    continue;
                }
                const shareA = (push * bodyA.inverseMass) / inverseTotal;
                const shareB = (push * bodyB.inverseMass) / inverseTotal;

                this.moveCoinInsideBoard(
                    coinA,
                    coinA.x - normalX * shareA,
                    coinA.y - normalY * shareA,
                    bodyA.circleRadius,
                    floor
                );
                this.moveCoinInsideBoard(
                    coinB,
                    coinB.x + normalX * shareB,
                    coinB.y + normalY * shareB,
                    bodyB.circleRadius,
                    floor
                );
            }
        }

        for (const [coinA, coinB] of pendingMerges) {
            this.tryMergeFruits(coinA, coinB);
        }
    }

    // Separation must never be able to push a coin out through the jar —
    // the walls are solver constraints, and this pass runs after the solver,
    // so nothing else would catch it this frame. No top clamp: coins are
    // legitimately above the play rectangle on their way in (and the top
    // wall is disabled in setBounds() for that reason).
    private moveCoinInsideBoard(
        coin: Fruit,
        x: number,
        y: number,
        radius: number,
        floor: number
    ): void {
        coin.setPosition(
            Phaser.Math.Clamp(x, radius, PLAY_AREA_WIDTH - radius),
            Math.min(y, floor - radius)
        );
    }

    update(time: number, delta: number): void {
        this.elapsedTime += delta;
        this.resolveCoinOverlaps();
        if (!this.gameManager.isGameOver()) {
            this.fruits.children.entries.forEach((entry) => {
                const sprite = entry as Fruit;
                sprite.update(time, delta);
                if (sprite !== this.activeFruit && sprite !== this.pairMate && sprite.lifetime > 1000) {
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
                        entry !== this.activeFruit && entry !== this.pairMate && entry.lifetime > 1000 && entry.y < DANGER_ZONE_Y
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

        const leftDown =
            this.keys.get('A')?.isDown || this.keys.get('LEFT')?.isDown;
        const rightDown =
            this.keys.get('D')?.isDown || this.keys.get('RIGHT')?.isDown;
        const pointer = this.input.activePointer;
        if (
            (leftDown || rightDown || pointer.isDown) &&
            !this.gameManager.isGameOver()
        ) {
            this.ensureGameStarted();
        }
        if(!this.gameManager.isGameOver()) {
            this.updateActiveFruitKeyboardControl(Math.min(delta,50));
            const rotateDown=this.keys.get('PAIR_ROTATE')?.isDown||this.keys.get('PAIR_ROTATE_UP')?.isDown;
            if(rotateDown&&!this.rotateWasDown)this.rotatePair();this.rotateWasDown=!!rotateDown;
            this.fallPair(420*Math.min(delta,50)/1000);
        }
        const cam=this.cameras.main;const dpr=this.registry.get(DEVICE_PIXEL_RATIO_REGISTRY_KEY)||1;
        const zoom=cam.zoom/dpr;
        const launcherX=((this.lastSpawnX??CANVAS_WIDTH/2)-cam.scrollX-cam.width/2)*zoom+cam.width/(2*dpr);
        this.coinUI?.position(Phaser.Math.Clamp(launcherX,125*zoom+8,this.scale.width-125*zoom-8),(205-cam.scrollY-cam.height/2)*zoom+cam.height/(2*dpr),zoom);
        if (!this.gameManager.isGameOver())this.updateActiveFruitFromPointer(pointer);

        const debugKey = this.keys.get('DEBUG_TOGGLE');
        if (debugKey && this.input.keyboard.checkDown(debugKey, 1000)) {
            this.events.emit('debugToggle');
        }

        const changeFruitKey = this.keys.get('FRUIT_TOGGLE');
        if (
            changeFruitKey &&
            this.input.keyboard.checkDown(changeFruitKey, 1000)
        ) {
            // Only cycles the HUD preview — the coin already falling is
            // unaffected, same as any other debug tweak made mid-drop.
            this.previewFruit = ((this.previewFruit + 1) %
                (OrbTier.Supernova + 1)) as OrbTier;
            this.events.emit('nextFruit', this.previewFruit);
        }

        const nextFruitHoldKey = this.keys.get('NEXT_FRUIT_HOLD');
        if (
            nextFruitHoldKey &&
            this.input.keyboard.checkDown(nextFruitHoldKey, 1000)
        ) {
            if (!this.heldNextFruit) {
                this.heldNextFruit = this.previewFruit;
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
}

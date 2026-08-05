import { BodyType } from 'matter';

let nextFruitId = 0;

export enum OrbTier {
    Chispa = 0,
    Destello = 1,
    Fragmento = 2,
    Nucleo = 3,
    Cristal = 4,
    Prisma = 5,
    // Merge order for 6-10 reordered (Diamante moved to last before
    // Supernova) — the various ORB_TIER_* Records below key off these
    // names via computed properties, so they don't need to change: object
    // property lookup resolves by the enum's numeric value, not by the
    // order either the enum or the Record literal is written in.
    Platino = 6,
    Esmeralda = 7,
    Reina = 8,
    Zafiro = 9,
    OrbeSolar = 10,
    Supernova = 11,
}

export const ORB_TIER_COLORS: Record<OrbTier, number> = {
    [OrbTier.Chispa]: 0x7ad7f0,
    [OrbTier.Destello]: 0x5ecbe0,
    [OrbTier.Fragmento]: 0x6a8cff,
    [OrbTier.Nucleo]: 0x8a5cff,
    [OrbTier.Cristal]: 0xc25cff,
    [OrbTier.Prisma]: 0xff5cd6,
    [OrbTier.OrbeSolar]: 0xffb15c,
    [OrbTier.Esmeralda]: 0x27ae60,
    [OrbTier.Zafiro]: 0x2874d6,
    [OrbTier.Platino]: 0xc9d3da,
    [OrbTier.Reina]: 0xe8b923,
    [OrbTier.Supernova]: 0xffffff,
};

export const ORB_TIER_PREFIXES: Record<OrbTier, string> = {
    [OrbTier.Chispa]: 'chispa',
    [OrbTier.Destello]: 'destello',
    [OrbTier.Fragmento]: 'fragmento',
    [OrbTier.Nucleo]: 'nucleo',
    [OrbTier.Cristal]: 'cristal',
    [OrbTier.Prisma]: 'prisma',
    [OrbTier.OrbeSolar]: 'orbe_solar',
    [OrbTier.Esmeralda]: 'esmeralda',
    [OrbTier.Zafiro]: 'zafiro',
    [OrbTier.Platino]: 'platino',
    [OrbTier.Reina]: 'reina',
    [OrbTier.Supernova]: 'supernova',
};

// File numbering doesn't match tier order — 9/10/11/12 were named by asset
// delivery order, not gameplay order, and 8_sp.png (already tier 11) was
// never renumbered. Kept as-is deliberately; the lookup is by exact string,
// not by parsing the leading number.
export const COIN_TIER_FILES: Record<OrbTier, string> = {
    [OrbTier.Chispa]: '1_cobre.png',
    [OrbTier.Destello]: '2_bronce.png',
    [OrbTier.Fragmento]: '3_plata.png',
    [OrbTier.Nucleo]: '4_oro.png',
    [OrbTier.Cristal]: '5_rubi.png',
    [OrbTier.Prisma]: '6_amatista.png',
    [OrbTier.OrbeSolar]: '7_diamante.png',
    [OrbTier.Esmeralda]: '9_esmeralda.png',
    [OrbTier.Zafiro]: '10_zafiro.png',
    [OrbTier.Platino]: '12_platino.png',
    [OrbTier.Reina]: '11_reina.png',
    [OrbTier.Supernova]: '8_sp.png',
};

// setScale() factor per tier so every coin ends up at the same final
// diameter the old procedurally-generated circle had at that tier
// (diameter = 2.7 * (24 + tier * 8)). The source PNGs are close to but not
// exactly uniform in size (340x340 / 330x330 / 350x350 depending on the
// file), so each factor is target-diameter / that file's actual width.
export const ORB_TIER_SCALES: Record<OrbTier, number> = {
    // 1_cobre.png was replaced with a 680x680 native file (previously
    // ~340x340) — re-measured: 64.8 / 680 = 0.09529..., rounded.
    [OrbTier.Chispa]: 0.0953,
    [OrbTier.Destello]: 0.2541,
    [OrbTier.Fragmento]: 0.3176,
    [OrbTier.Nucleo]: 0.3812,
    [OrbTier.Cristal]: 0.4582,
    [OrbTier.Prisma]: 0.5236,
    // Merge order changed (Platino/Esmeralda/Reina/Zafiro/OrbeSolar
    // reordered — see the OrbTier enum) — the color/prefix/file tables
    // don't care since they're identity properties keyed by name, but
    // *scale* is derived from the diameter formula, which is a function of
    // the numeric tier position, not the name. So every one of these 5
    // needed its target diameter (and therefore scale) recalculated for
    // its new position, even though 4 of the 5 files themselves didn't
    // change. Esmeralda happens to still be tier 7, so its value is
    // unchanged from before; the other 4 are not.
    [OrbTier.Platino]: 0.226, // tier 6 now: 194.4 / 860
    [OrbTier.Esmeralda]: 0.2512, // tier 7, unchanged: 216.0 / 860
    [OrbTier.Reina]: 0.2763, // tier 8 now: 237.6 / 860
    [OrbTier.Zafiro]: 0.3014, // tier 9 now: 259.2 / 860
    [OrbTier.OrbeSolar]: 0.8259, // tier 10 now: 7_diamante.png is 340x340 -> 280.8 / 340
    // Supernova moved from tier 7 to tier 11 when Esmeralda/Zafiro/Platino/
    // Reina were inserted, so its target diameter grows too (still the same
    // formula, just a bigger tier number): 2.7 * (24 + 11*8) = 302.4.
    // 8_sp.png is still 2048x2048 -> 302.4 / 2048 = 0.1477.
    [OrbTier.Supernova]: 0.1477,
};

// Fraction of the sprite's half-width that the coin's actually-opaque disc
// occupies (measured per file: last radius where alpha stays >= 250 along
// a ray from center, averaged over 4 cardinal directions). The remaining
// outer ring is a glow/vignette that fades in color and alpha together and
// isn't part of the coin itself, so it must be excluded from the collider
// or the hitbox reads as much bigger than the visible coin.
export const ORB_TIER_HITBOX_FRACTIONS: Record<OrbTier, number> = {
    // Re-verified against the new 1_cobre.png — same margin convention,
    // came out to the same 0.7824 as before (266px of a 340px half-width).
    [OrbTier.Chispa]: 0.7824,
    [OrbTier.Destello]: 0.7824,
    [OrbTier.Fragmento]: 0.7824,
    [OrbTier.Nucleo]: 0.7824,
    [OrbTier.Cristal]: 0.7818,
    [OrbTier.Prisma]: 0.7818,
    [OrbTier.OrbeSolar]: 0.8147,
    // All 4 new files measured identically (337px of 430px half-width on
    // all 4 cardinal rays) — same glow-margin convention across the set.
    [OrbTier.Esmeralda]: 0.7837,
    [OrbTier.Zafiro]: 0.7837,
    [OrbTier.Platino]: 0.7837,
    [OrbTier.Reina]: 0.7837,
    // Re-measured against the new 2048x2048 8_sp.png (same alpha-scan
    // method): avg last-radius-at-alpha>=250 across 4 cardinal directions
    // was 915.25px of a 1024px half-width -> 0.8938. The new art's glow
    // margin is proportionally thinner than the old file's.
    [OrbTier.Supernova]: 0.8938,
};

// Tiers with a validated _blink variant (real transparency, same native
// resolution as their normal texture — see MainScene.ts's preload()
// comment on why that resolution match matters). OrbeSolar (diamante)
// and Supernova (GG) are deliberately excluded — no blink for either.
// Keyed by file name (not texture key) since that's what MainScene.ts's
// preload() needs to load each one; Fruit.ts only cares that a tier is
// a key of this record at all (see the constructor below).
export const BLINK_COIN_FILES: Partial<Record<OrbTier, string>> = {
    [OrbTier.Chispa]: '1_cobre_blink.png',
    [OrbTier.Destello]: '2_bronce_blink.png',
    [OrbTier.Fragmento]: 'plata_blink_transparent.png',
    [OrbTier.Nucleo]: '4_oro_blink.png',
    [OrbTier.Cristal]: '5_rubi_blink.png',
    [OrbTier.Prisma]: '6_amatista_blink.png',
    [OrbTier.Platino]: '12_platino_blink.png',
    [OrbTier.Esmeralda]: '9_esmeralda_blink.png',
    [OrbTier.Reina]: '11_reina_blink.png',
    [OrbTier.Zafiro]: '10_zafiro_blink.png',
};

export function fruitTypeToTextureString(fruitType: OrbTier) {
    // Used to be `fruitType % 8` — a leftover guard from before
    // MainScene.ts's merge handler blocked merging two Supernovas (which
    // used to silently produce an invalid tier-8 orb). That guard exists
    // now, so fruitType is always in-range here, and with 12 tiers a mod-8
    // would actively misresolve tiers 8-10 to the wrong texture.
    return `${ORB_TIER_PREFIXES[fruitType]}_${gameOptions.theme}`;
}

// Applies to every tier in BLINK_COIN_FILES (10 of 12 — diamante and GG
// opted out). BLINK_MIN/MAX_DELAY_MS is the gap between blinks;
// BLINK_DURATION_MS is how long the closed-eyes frame stays up before
// reverting.
const BLINK_MIN_DELAY_MS = 2000;
const BLINK_MAX_DELAY_MS = 6000;
const BLINK_DURATION_MS = 120;

export class Fruit extends Phaser.Physics.Matter.Image {
    fruitType: OrbTier;
    readonly id: number;

    lifetime: number;

    private debugGraphics: Phaser.GameObjects.Graphics;

    private readonly normalTextureKey: string;
    private readonly blinkTextureKey: string;
    private blinkTimer: Phaser.Time.TimerEvent;

    constructor(
        world: Phaser.Physics.Matter.World,
        x: number,
        y: number,
        type: OrbTier,
        debugGraphics: Phaser.GameObjects.Graphics
    ) {
        let sprite = fruitTypeToTextureString(type);
        super(world, x, y, sprite);
        this.id = nextFruitId++;
        this.fruitType = type;
        // Tier growth is baked into the display scale — the source coin
        // images are fixed-size (256px, or 2048px for Supernova).
        this.setScale(ORB_TIER_SCALES[type]);
        this.setCircle((this.displayWidth / 2) * ORB_TIER_HITBOX_FRACTIONS[type]);
        this.lifetime = 0;
        this.debugGraphics = debugGraphics;

        this.normalTextureKey = sprite;
        if (type in BLINK_COIN_FILES) {
            this.blinkTextureKey = `${sprite}_blink`;
            this.scheduleNextBlink();
        }
    }

    // Every file in BLINK_COIN_FILES is generated at *exactly* the same
    // native resolution as its corresponding normal texture, specifically so
    // this never needs to touch scale/size — a bare setTexture() only
    // swaps the rendered frame. This matters more than it looks: on a
    // Matter-physics GameObject, scaleX/scaleY are not plain properties
    // (see Phaser.Physics.Matter.Components.Transform) — setting them
    // calls Matter.Body.scale() on the underlying body, which really
    // resizes the collision vertices and recomputes mass/inertia. An
    // earlier version of this compensated for a resolution mismatch via
    // setDisplaySize() after each swap, which (via that same scaleX/scaleY
    // path) collapsed the body's mass by ~36x for the blink's duration —
    // the coin lost its resting contact, dropped, and snapped back on
    // revert. Keeping both textures the same native size avoids the whole
    // scale path being touched at all.
    private scheduleNextBlink(): void {
        const delay = Phaser.Math.Between(BLINK_MIN_DELAY_MS, BLINK_MAX_DELAY_MS);
        this.blinkTimer = this.scene.time.delayedCall(delay, () => {
            this.setTexture(this.blinkTextureKey);
            this.blinkTimer = this.scene.time.delayedCall(
                BLINK_DURATION_MS,
                () => {
                    this.setTexture(this.normalTextureKey);
                    this.scheduleNextBlink();
                }
            );
        });
    }

    public update(time: number, delta: number): void {
        this.lifetime += delta;

        this.debugGraphics.clear();
        if (this.scene.registry.get('debugVisible')) {
            this.world.renderBody(
                this.body as BodyType,
                this.debugGraphics,
                true,
                0x28de19,
                1,
                1,
                0,
                0
            );
        }
    }

    public destroy(fromScene?: boolean): void {
        // Without this, a pending delayedCall from scheduleNextBlink()
        // fires after merge/removal and calls setTexture on an already-
        // destroyed Matter GameObject.
        if (this.blinkTimer) {
            this.blinkTimer.remove();
        }
        super.destroy(fromScene);
        this.debugGraphics.destroy(fromScene);
    }
}

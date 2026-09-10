// Reads the device's safe-area insets (notch / status bar / home
// indicator) in real CSS px, via the standard "probe div" technique: a
// hidden element with `padding-<side>: env(safe-area-inset-<side>)` is
// inserted into the DOM, then `getComputedStyle` resolves that env()
// expression to an actual px number the CSS engine already computed for
// us — env() itself can't be read from JS/TS directly.
//
// index.html's viewport meta already has `viewport-fit=cover`, which is
// what makes env(safe-area-inset-*) resolve to non-zero values at all on a
// notched device (without it, Safari never lets the page extend under the
// notch/status bar in the first place, and every inset reads 0).
//
// Not cached: deliberately recomputed on every call. This is cheap (one
// throwaway DOM node, a synchronous style read, no layout thrash beyond a
// single element) and the value can genuinely change at runtime — e.g.
// rotating a phone from portrait to landscape moves the notch from "top"
// to "side", changing safe-area-inset-top. HUDScene calls this once in
// create() and again on every 'resize' (which also fires on orientation
// change), so a stale cache would show the old rotation's inset until the
// next unrelated resize.
//
// This project's HUDScene works entirely in real CSS px already (see
// HUDScene.ts's own notes on Scale.RESIZE — this.scale.width/height ARE
// the real viewport size, no devicePixelRatio multiplication needed for
// position math), so the raw px value read here is used as-is. This is
// NOT true of every Phaser project — a sibling project that multiplies
// screen positions by devicePixelRatio would need to multiply this value
// by that same dpr before adding it to a position; don't copy that detail
// here without checking, it would double-offset things.
function readSafeAreaInset(side: 'top' | 'right' | 'bottom' | 'left'): number {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style[`padding${side[0].toUpperCase()}${side.slice(1)}` as any] =
        `env(safe-area-inset-${side})`;
    document.body.appendChild(probe);
    const computedPadding = parseFloat(
        getComputedStyle(probe)[`padding${side[0].toUpperCase()}${side.slice(1)}` as any] as string
    );
    document.body.removeChild(probe);
    return Number.isFinite(computedPadding) ? computedPadding : 0;
}

export function getSafeAreaInsetTop(): number {
    return readSafeAreaInset('top');
}

export interface SafeAreaInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export function getSafeAreaInsets(): SafeAreaInsets {
    return {
        top: readSafeAreaInset('top'),
        right: readSafeAreaInset('right'),
        bottom: readSafeAreaInset('bottom'),
        left: readSafeAreaInset('left'),
    };
}

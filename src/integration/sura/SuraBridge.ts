import { SURA_MSG, type SuraEnvelope, type SuraMsgType } from "./SuraTypes";
import type { SuraConfig } from "./SuraRuntimeConfig";

type BridgeListener = (envelope: SuraEnvelope) => void;

// Known message types that can arrive from the host. Anything else is silently
// ignored (browser extensions, dev tools, other iframes, etc.).
const INBOUND_TYPES = new Set<string>([
  SURA_MSG.INIT,
  SURA_MSG.PAUSE,
  SURA_MSG.RESUME,
]);

/**
 * Thin transport layer around postMessage.
 *
 * Responsibilities:
 *  - Register / remove a single "message" listener on window.
 *  - Capture the host's origin from its first INIT_GAME (there is no
 *    build-time SURA_PARENT_ORIGIN anymore — one build runs in every
 *    environment, including the native app's WebView, which has no real
 *    origin to hardcode in the first place).
 *  - Validate origin (once known) and the envelope structure.
 *  - Route envelopes to registered per-type subscribers.
 *  - Send outbound messages to the parent window.
 *
 * This class is intentionally unaware of game logic or state machines.
 * SuraIntegrationService owns the logic and subscribes here.
 */
export class SuraBridge {
  private readonly config: SuraConfig;
  private readonly listeners = new Map<SuraMsgType, Set<BridgeListener>>();
  private boundOnMessage: ((event: MessageEvent) => void) | null = null;
  private active = false;

  /**
   * Set once, from the origin of the first valid INIT_GAME. Everything sent
   * afterward (except MINIGAME_READY, which has to go out before this is
   * known) targets this origin instead of "*".
   */
  private parentOrigin: string | null = null;

  constructor(config: SuraConfig) {
    this.config = config;
  }

  /**
   * Attach the window message listener.
   * No-op in standalone mode or if already started.
   */
  start(): void {
    if (this.active || this.config.mode === "standalone") return;
    this.active = true;
    this.boundOnMessage = (event: MessageEvent) => this.onMessage(event);
    window.addEventListener("message", this.boundOnMessage);
  }

  /**
   * Detach the window message listener and clear all subscribers.
   */
  destroy(): void {
    if (!this.active) return;
    this.active = false;
    if (this.boundOnMessage) {
      window.removeEventListener("message", this.boundOnMessage);
      this.boundOnMessage = null;
    }
    this.listeners.clear();
    this.parentOrigin = null;
  }

  /**
   * Subscribe to a specific inbound message type.
   */
  on(type: SuraMsgType, listener: BridgeListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  /**
   * Unsubscribe from a specific inbound message type.
   */
  off(type: SuraMsgType, listener: BridgeListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * MINIGAME_READY — the message that opens the handshake. It has to go out
   * before the host's origin is known (that's derived from the host's own
   * INIT_GAME, which hasn't arrived yet), so it's the one message that
   * always targets "*". Carries nothing sensitive (game_id, version).
   */
  sendReady(payload: Record<string, unknown>): void {
    if (this.config.mode === "standalone") return;
    window.parent.postMessage({ type: SURA_MSG.READY, payload }, "*");
  }

  /**
   * Send an outbound message to the parent window.
   *
   * Safe to call from any mode — no-op if not embedded, or if the host's
   * origin isn't known yet (i.e. before the first INIT_GAME).
   */
  sendToParent(type: SuraMsgType, payload: Record<string, unknown>): void {
    if (this.config.mode === "standalone") return;
    if (!this.parentOrigin)                return;

    const envelope: SuraEnvelope = { type, payload };
    window.parent.postMessage(envelope, this.parentOrigin);
  }

  /**
   * Sends the game-complete result to the host. Unlike sendToParent, this is
   * NOT enveloped — the host listens for a flat
   * { type: 'GAME_COMPLETE', sessionId, score, provider, duration_ms? }
   * message, not { type, payload }.
   */
  sendCompletion(input: {
    sessionId:   string;
    score:       number;
    provider:    string;
    durationMs?: number;
  }): void {
    if (this.config.mode === "standalone") return;
    if (!this.parentOrigin)                return;

    const message: Record<string, unknown> = {
      type:      SURA_MSG.COMPLETED,
      sessionId: input.sessionId,
      score:     input.score,
      provider:  input.provider,
    };
    if (input.durationMs !== undefined) {
      message.duration_ms = input.durationMs;
    }
    window.parent.postMessage(message, this.parentOrigin);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private onMessage(event: MessageEvent): void {
    // A synthetic MessageEvent built by hand (the native app's injected
    // WebView bridge) has `source === null` — accept those. Reject anything
    // that isn't null and also isn't the actual parent frame.
    if (event.source !== null && event.source !== window.parent) return;

    if (!isValidEnvelope(event.data)) return;
    const envelope = event.data as SuraEnvelope;
    if (!INBOUND_TYPES.has(envelope.type)) return;

    if (envelope.type === SURA_MSG.INIT) {
      // The first valid INIT_GAME defines who we answer to from here on.
      // event.origin can legitimately be "" for some synthetic/native
      // deliveries, or the literal string "null" for an opaque-origin host
      // (e.g. a sandboxed iframe) — postMessage rejects "null" as an
      // invalid targetOrigin outright, so both fall back to "*" rather than
      // locking onto a value no real postMessage call will ever match.
      if (this.parentOrigin === null) {
        const origin = event.origin;
        this.parentOrigin = origin && origin !== "null" ? origin : "*";
      }
    } else if (this.parentOrigin !== null && event.origin !== this.parentOrigin) {
      // Once we know who the host is, reject anything claiming to be it from
      // elsewhere. Doesn't apply before the host is known — there's nothing
      // sensitive to protect yet, and rejecting would just make PAUSE/RESUME
      // sent early impossible to ever receive.
      return;
    }

    const set = this.listeners.get(envelope.type);
    if (set) {
      for (const listener of set) {
        listener(envelope);
      }
    }
  }
}

function isValidEnvelope(msg: unknown): msg is SuraEnvelope {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m["type"]    === "string" &&
    typeof m["payload"] === "object" &&
    m["payload"] !== null
  );
}

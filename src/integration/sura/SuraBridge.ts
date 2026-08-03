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
 *  - Validate origin and source before dispatching.
 *  - Validate the SURA envelope structure.
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
   * Send an outbound message to the parent window.
   *
   * Safe to call from any mode — no-op if not embedded or in standalone.
   * Never uses "*" as the target origin.
   */
  sendToParent(type: SuraMsgType, payload: Record<string, unknown>): void {
    if (this.config.mode === "standalone") return;
    if (!this.config.isEmbedded)           return;
    if (!this.config.parentOrigin)         return;

    const envelope: SuraEnvelope = {
      source:  "sura-minigames",
      version: 1,
      type,
      payload,
    };
    window.parent.postMessage(envelope, this.config.parentOrigin);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private onMessage(event: MessageEvent): void {
    // Reject messages from unexpected origins.
    if (this.config.parentOrigin && event.origin !== this.config.parentOrigin) return;

    // Reject messages not from the direct parent window.
    if (event.source !== window.parent) return;

    // Validate envelope structure.
    if (!isValidEnvelope(event.data)) return;

    const envelope = event.data as SuraEnvelope;

    // Silently ignore unknown types (other libraries, future extensions).
    if (!INBOUND_TYPES.has(envelope.type)) return;

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
    m["source"]  === "sura-minigames" &&
    m["version"] === 1 &&
    typeof m["type"]    === "string" &&
    typeof m["payload"] === "object" &&
    m["payload"] !== null
  );
}

import {
  SURA_MSG,
  type GameResult,
  type InitPayload,
  type IntegrationMode,
  type SuraIntegrationState,
  type SuraServiceListener,
  type SuraSessionContext,
} from "./SuraTypes";
import { SURA_CONFIG } from "./SuraRuntimeConfig";
import { SuraBridge } from "./SuraBridge";

// ─── State machine (parent-submit flow) ──────────────────────────────────────
//
// disabled        → (standalone — no bridge, no transitions)
// waiting-context → ready        (received valid SURA_MINIGAME_INIT)
// ready           → playing      (startGameSession called — STARTED sent)
// playing         → completed    (completeGameSession called — COMPLETED sent)
// completed       → ready        (new SURA_MINIGAME_INIT received)
// waiting-context
//   | ready
//   | completed    → error       (invalid INIT payload received)
//
// Parent-submit model: the game communicates ONLY via postMessage.
// No HTTP calls are made from the game. Score persistence is handled
// by the SURA host after it receives MINIGAME_COMPLETED.

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: SuraIntegrationService | null = null;

export function initSuraService(): SuraIntegrationService {
  if (!_instance) _instance = new SuraIntegrationService();
  return _instance;
}

export function getSuraService(): SuraIntegrationService {
  if (!_instance) {
    throw new Error(
      "[SURA] SuraIntegrationService not initialised. Call initSuraService() first (from game.ts).",
    );
  }
  return _instance;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SuraIntegrationService {
  private state: SuraIntegrationState;
  private readonly bridge: SuraBridge;
  private context:  SuraSessionContext | null = null;
  private readonly subscribers = new Set<SuraServiceListener>();
  private initialised = false;

  constructor() {
    this.state  = SURA_CONFIG.mode === "standalone" ? "disabled" : "waiting-context";
    this.bridge = new SuraBridge(SURA_CONFIG);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  get mode(): IntegrationMode {
    return SURA_CONFIG.mode;
  }

  getState(): SuraIntegrationState {
    return this.state;
  }

  /**
   * Called once from game.ts after Phaser initialises.
   * Attaches the postMessage bridge and notifies the host that the game
   * is ready to receive a session context.
   */
  initialize(): void {
    if (this.initialised || SURA_CONFIG.mode === "standalone") return;
    this.initialised = true;
    this.bridge.start();
    this.registerBridgeHandlers();
    this.notifyReady();
  }

  /**
   * Subscribe to service events (state changes, host pause/resume).
   * Scenes should unsubscribe on their SHUTDOWN event.
   */
  subscribe(listener: SuraServiceListener): void {
    this.subscribers.add(listener);
  }

  unsubscribe(listener: SuraServiceListener): void {
    this.subscribers.delete(listener);
  }

  /**
   * Called from MainScene's dropFruit handler, the first time a round starts.
   *
   * Standalone: returns true immediately.
   * SURA (parent-submit): sends MINIGAME_STARTED, transitions to "playing".
   */
  async startGameSession(): Promise<boolean> {
    if (SURA_CONFIG.mode === "standalone") return true;
    if (this.state !== "ready") return false;
    if (!this.context) return false;

    this.setState("playing");
    this.bridge.sendToParent(SURA_MSG.STARTED, {
      session_id: this.context.sessionId,
      game_id:    this.context.gameId,
    });
    return true;
  }

  /**
   * Called from MainScene's gameOver handler to report the game result.
   *
   * SURA (parent-submit): sends MINIGAME_COMPLETED via postMessage.
   * The host receives the score and is responsible for persisting it.
   * No HTTP calls are made from the game.
   */
  async completeGameSession(result: GameResult): Promise<void> {
    if (SURA_CONFIG.mode === "standalone") return;
    if (this.state !== "playing") return;
    if (!this.context) return;

    this.bridge.sendToParent(SURA_MSG.COMPLETED, {
      session_id: this.context.sessionId,
      game_id:    this.context.gameId,
      score:      result.score,
      stats: {
        isNewRecord:         result.isNewRecord,
        // Local reward preview — SURA backend is the authority on actual points.
        estimatedSuraPoints: result.estimatedSuraPoints,
        rewardScoreUnit:     result.rewardScoreUnit,
        rewardPointsPerUnit: result.rewardPointsPerUnit,
      },
    });
    this.setState("completed");
  }

  /**
   * Ask the parent (SURA app) to close the minigame iframe.
   * Used in real "sura" mode by an exit button, if/when one exists.
   */
  requestExit(): void {
    if (SURA_CONFIG.mode !== "sura") return;
    this.bridge.sendToParent(SURA_MSG.EXIT_REQUESTED, {});
  }

  destroy(): void {
    this.bridge.destroy();
    this.subscribers.clear();
    _instance = null;
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private registerBridgeHandlers(): void {
    this.bridge.on(SURA_MSG.INIT,   (env) => this.handleInit(env.payload));
    this.bridge.on(SURA_MSG.PAUSE,  ()    => this.handleHostPause());
    this.bridge.on(SURA_MSG.RESUME, ()    => this.handleHostResume());
  }

  private notifyReady(): void {
    if (!SURA_CONFIG.isEmbedded) return;
    this.bridge.sendToParent(SURA_MSG.READY, {
      game_id: SURA_CONFIG.gameId,
      version: SURA_CONFIG.gameVersion,
    });
  }

  private handleInit(payload: Record<string, unknown>): void {
    const resettable: SuraIntegrationState[] = [
      "waiting-context", "completed", "error", "unauthorized",
    ];
    if (!resettable.includes(this.state)) return;

    // Validate required INIT fields.
    const p = payload as Partial<InitPayload>;
    const token      = typeof p.token      === "string" ? p.token      : null;
    const session_id = typeof p.session_id === "string" ? p.session_id : null;
    const player_id  = typeof p.player_id  === "number" ? p.player_id  : null;
    const game_id    = typeof p.game_id    === "string" ? p.game_id    : null;

    if (!token || !session_id || player_id === null || !game_id) {
      this.setState("error");
      this.bridge.sendToParent(SURA_MSG.ERROR, { message: "Invalid SURA_MINIGAME_INIT payload." });
      return;
    }

    // Store context in memory only — never logged, never persisted.
    this.context = {
      token,
      sessionId: session_id,
      playerId:  player_id,
      gameId:    game_id,
      nickname:  typeof p.nickname === "string" ? p.nickname : undefined,
    };

    // Acknowledge receipt of the context.
    this.bridge.sendToParent(SURA_MSG.SESSION_ACCEPTED, {
      session_id,
      game_id,
    });

    // parent-submit: context is trusted as-is — no backend validation needed.
    // Enable the JUGAR button immediately.
    this.setState("ready");
  }

  private handleHostPause(): void {
    this.emit({ type: "host-pause" });
  }

  private handleHostResume(): void {
    this.emit({ type: "host-resume" });
  }

  private setState(next: SuraIntegrationState): void {
    this.state = next;
    this.emit({ type: "state-changed", state: next });
  }

  private emit(event: Parameters<SuraServiceListener>[0]): void {
    for (const listener of this.subscribers) {
      listener(event);
    }
  }
}

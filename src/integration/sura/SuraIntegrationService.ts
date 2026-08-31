import {
  SURA_MSG,
  type GameResult,
  type InitPayload,
  type IntegrationMode,
  type SuraIntegrationState,
  type SuraServiceListener,
  type SuraSessionContext,
} from "./SuraTypes";
import { SURA_CONFIG, GAME_SLUG } from "./SuraRuntimeConfig";
import { SuraBridge } from "./SuraBridge";
import { saveGameState } from "../../storage";

// ─── State machine (parent-submit flow) ──────────────────────────────────────
//
// disabled        → (standalone — no bridge, no transitions)
// waiting-context → ready        (received valid INIT_GAME)
// ready           → playing      (startGameSession called — MINIGAME_STARTED sent)
// playing         → completed    (completeGameSession called — GAME_COMPLETE sent)
// completed       → ready        (new INIT_GAME received)
// waiting-context
//   | ready
//   | completed    → error       (invalid INIT payload received)
//
// Parent-submit model: the game communicates ONLY via postMessage.
// No HTTP calls are made from the game (aside from the public leaderboard
// read). Score persistence is handled by the SURA host after it receives
// GAME_COMPLETE.

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

  getSessionToken(): string | null {
    return this.context?.token ?? null;
  }

  getNickname(): string | null {
    return this.context?.nickname ?? null;
  }

  /**
   * gameId comes from the host's own INIT_GAME payload — never hardcoded —
   * so the same build works against local/staging/prod without a rebuild.
   */
  getGameId(): string | null {
    return this.context?.gameId ?? null;
  }

  getApiBaseUrl(): string | null {
    return this.context?.apiBaseUrl ?? null;
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
      sessionId: this.context.sessionId,
      gameId:    this.context.gameId,
    });
    return true;
  }

  /**
   * Called from MainScene's gameOver handler to report the game result.
   *
   * SURA (parent-submit): sends the flat GAME_COMPLETE message via
   * postMessage. The host receives the score and is responsible for
   * persisting it and paying any reward. No HTTP calls are made from the
   * game. Note the flat contract has no room for isNewRecord/estimated
   * points/etc — those fields exist only for local UI, they don't survive
   * onto the wire (same as Pengu Rush / Joystick Pop).
   */
  async completeGameSession(result: GameResult): Promise<void> {
    if (SURA_CONFIG.mode === "standalone") return;
    if (this.state !== "playing") return;
    if (!this.context) return;

    this.bridge.sendCompletion({
      sessionId:  this.context.sessionId,
      score:      result.score,
      provider:   GAME_SLUG,
      durationMs: result.durationMs,
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

  /**
   * MINIGAME_READY has to go out before the host's origin is known (that's
   * derived from the host's own INIT_GAME, which hasn't arrived yet) — the
   * bridge always sends it with target "*".
   */
  private notifyReady(): void {
    this.bridge.sendReady({
      game_id: GAME_SLUG,
      version: SURA_CONFIG.gameVersion,
    });
  }

  private handleInit(payload: Record<string, unknown>): void {
    const resettable: SuraIntegrationState[] = [
      "waiting-context", "completed", "error", "unauthorized",
    ];
    if (!resettable.includes(this.state)) return;

    // Validate required INIT fields. Real contract: camelCase, no player_id
    // (the host identifies the player from the session token itself).
    const p = payload as Partial<InitPayload>;
    const token     = typeof p.token     === "string" ? p.token     : null;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : null;

    if (!token || !sessionId) {
      this.setState("error");
      this.bridge.sendToParent(SURA_MSG.ERROR, { message: "Invalid INIT_GAME payload." });
      return;
    }

    // Store context in memory only — never logged, never persisted.
    this.context = {
      token,
      sessionId,
      gameId:     typeof p.gameId     === "string" ? p.gameId     : GAME_SLUG,
      apiBaseUrl: typeof p.apiBaseUrl === "string" ? p.apiBaseUrl : "",
      nickname:   typeof p.username   === "string" ? p.username   : undefined,
      bestScore:  typeof p.bestScore  === "number" ? p.bestScore  : undefined,
    };

    // Reconcile the local (per-device) record against the account's real
    // best score. Only ever raises it, never lowers it — a missing/stale/
    // zero remote value (older host not rolled out yet, no runs for this
    // account yet) must not erase a real local win that hasn't round-
    // tripped to the backend yet. gameState is the same global object
    // MainScene/RankingScene read, mutated in place so both see the
    // reconciled value whenever they're next consulted.
    if (this.context.bestScore !== undefined && this.context.bestScore > gameState.highScore) {
      gameState.highScore = this.context.bestScore;
      saveGameState(gameState);
    }

    // Acknowledge receipt of the context.
    this.bridge.sendToParent(SURA_MSG.SESSION_ACCEPTED, {
      sessionId,
      gameId: this.context.gameId,
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

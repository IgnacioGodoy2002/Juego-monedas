// ─── Integration modes ────────────────────────────────────────────────────────
//
// Decided at runtime from window.parent/ReactNativeWebView (SuraRuntimeConfig),
// never at build time — "sura-mock" doesn't exist anymore, since embedding the
// game (even in a local dev iframe) is now indistinguishable at runtime from
// the real host.

export type IntegrationMode = "standalone" | "sura";

// ─── Integration state machine ────────────────────────────────────────────────

export type SuraIntegrationState =
  | "disabled"           // standalone — no bridge, no transitions
  | "waiting-context"    // sura — waiting for INIT_GAME
  | "validating"
  | "ready"              // context received, waiting for the first drop
  | "starting"
  | "playing"
  | "completing"
  | "completed"
  | "unauthorized"
  | "error";

// ─── Session context ────────────────────────────────────────────────────────
//
// Entirely populated from the host's INIT_GAME payload — gameId and
// apiBaseUrl included, so nothing here depends on how this build was
// compiled or which environment it's running in.

export type SuraSessionContext = {
  token:      string;
  sessionId:  string;
  gameId:     string;
  apiBaseUrl: string;
  nickname?:  string;
};

// ─── Game result ──────────────────────────────────────────────────────────────

export type GameResult = {
  score:               number;
  isNewRecord?:        boolean;
  // Local reward preview — SURA backend is the authority on actual points.
  estimatedSuraPoints?: number;
  rewardScoreUnit?:    number;
  rewardPointsPerUnit?: number;
  // Wall-clock session length — lets sura-api's anti-cheat bound score
  // against elapsed time (score_rate_curve). Optional: absent in standalone
  // mode or if the first-drop timestamp was never captured.
  durationMs?:         number;
};

// ─── postMessage event names ──────────────────────────────────────────────────
//
// Confirmed against the real host contract in sura-universal (same contract
// already applied to Pengu Rush and Joystick Pop).
// All event strings are centralised here. Do NOT reference raw strings anywhere.

export const SURA_MSG = {
  // Host (SURA app) → game (iframe / WebView)
  INIT:             "INIT_GAME",
  PAUSE:            "SURA_MINIGAME_PAUSE",
  RESUME:           "SURA_MINIGAME_RESUME",
  // Game (iframe / WebView) → host (SURA app)
  READY:            "MINIGAME_READY",
  SESSION_ACCEPTED: "MINIGAME_SESSION_ACCEPTED",
  STARTED:          "MINIGAME_STARTED",
  COMPLETED:        "GAME_COMPLETE",
  ERROR:            "MINIGAME_ERROR",
  EXIT_REQUESTED:   "MINIGAME_EXIT_REQUESTED",
} as const;

export type SuraMsgType = typeof SURA_MSG[keyof typeof SURA_MSG];

// ─── postMessage envelope ─────────────────────────────────────────────────────
//
// Only inbound host → game messages use this { type, payload } shape. The
// outbound completion message to the host is flat (see SuraBridge.sendCompletion).

export type SuraEnvelope = {
  type:    SuraMsgType;
  payload: Record<string, unknown>;
};

// ─── Inbound payload for INIT_GAME ─────────────────────────────────────────────
//
// gameId and apiBaseUrl are what let one build run in every environment
// (including the native app, which has no build-time host origin to
// hardcode) — without them the game has no way to know which mini-game UUID
// or API to call for the leaderboard.

export type InitPayload = {
  token:               string;
  sessionId:           string;
  username?:           string;
  referral?:           string;
  referredByNickname?: string;
  gameId?:             string;
  apiBaseUrl?:         string;
};

// ─── Events emitted by SuraIntegrationService to scene subscribers ────────────

export type SuraServiceEvent =
  | { type: "state-changed"; state: SuraIntegrationState }
  | { type: "host-pause" }
  | { type: "host-resume" };

export type SuraServiceListener = (event: SuraServiceEvent) => void;

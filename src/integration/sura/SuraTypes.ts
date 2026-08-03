// ─── Integration modes ────────────────────────────────────────────────────────

export type IntegrationMode = "standalone" | "sura-mock" | "sura";

// ─── Integration state machine ────────────────────────────────────────────────

export type SuraIntegrationState =
  | "disabled"           // standalone — no bridge, no transitions
  | "waiting-context"    // sura/mock  — waiting for SURA_MINIGAME_INIT
  | "validating"         // received INIT, calling validateSession
  | "ready"              // session valid, waiting for JUGAR
  | "starting"           // startGameSession called, awaiting response
  | "playing"            // session started, game running
  | "completing"         // completeGameSession called, awaiting response
  | "completed"          // result sent, waiting for new INIT or exit
  | "unauthorized"       // 401/403 from validateSession or startSession
  | "error";             // network error or unexpected server failure

// ─── Session context (camelCase internally; snake_case in postMessage) ────────

export type SuraSessionContext = {
  token:      string;
  sessionId:  string;
  playerId:   number;
  gameId:     string;
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
};

// ─── postMessage event names ──────────────────────────────────────────────────
//
// PROVISIONAL — names have NOT been confirmed by SURA.
// All event strings are centralised here. Do NOT reference raw strings anywhere.

export const SURA_MSG = {
  // Host (SURA app) → game (iframe)
  INIT:             "SURA_MINIGAME_INIT",
  PAUSE:            "SURA_MINIGAME_PAUSE",
  RESUME:           "SURA_MINIGAME_RESUME",
  // Game (iframe) → host (SURA app)
  READY:            "MINIGAME_READY",
  SESSION_ACCEPTED: "MINIGAME_SESSION_ACCEPTED",
  STARTED:          "MINIGAME_STARTED",
  COMPLETED:        "MINIGAME_COMPLETED",
  ERROR:            "MINIGAME_ERROR",
  EXIT_REQUESTED:   "MINIGAME_EXIT_REQUESTED",
} as const;

export type SuraMsgType = typeof SURA_MSG[keyof typeof SURA_MSG];

// ─── postMessage envelope ─────────────────────────────────────────────────────

export type SuraEnvelope = {
  source:  "sura-minigames";
  version: 1;
  type:    SuraMsgType;
  payload: Record<string, unknown>;
};

// ─── Inbound payload for SURA_MINIGAME_INIT ───────────────────────────────────

export type InitPayload = {
  token:      string;
  session_id: string;
  player_id:  number;
  game_id:    string;
  nickname?:  string;
};

// ─── Events emitted by SuraIntegrationService to scene subscribers ────────────

export type SuraServiceEvent =
  | { type: "state-changed"; state: SuraIntegrationState }
  | { type: "host-pause" }
  | { type: "host-resume" };

export type SuraServiceListener = (event: SuraServiceEvent) => void;

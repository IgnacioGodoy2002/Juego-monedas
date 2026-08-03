import type { IntegrationMode } from "./SuraTypes";

// Provisional identifier — NOT confirmed by SURA yet. Replace with the real
// game_id once it's assigned in the integration contract.
const PROVISIONAL_GAME_ID      = "orb_merge";
const PROVISIONAL_GAME_VERSION = "1.0.0";

export type SuraConfig = {
  readonly mode:          IntegrationMode;
  readonly gameId:        string;
  readonly gameVersion:   string;
  readonly parentOrigin:  string;
  readonly apiBaseUrl:    string;
  readonly isEmbedded:    boolean;
  readonly isDev:         boolean;
};

function buildConfig(): SuraConfig {
  const isDev      = Boolean(process.env.IS_DEBUG);
  const isEmbedded = window.parent !== window;

  const gameId      = process.env.SURA_GAME_ID       || PROVISIONAL_GAME_ID;
  const gameVersion = process.env.SURA_GAME_VERSION  || PROVISIONAL_GAME_VERSION;
  const envOrigin   = process.env.SURA_PARENT_ORIGIN || "";
  const envBaseUrl  = process.env.SURA_API_BASE_URL  || "";

  // ── Mode detection ─────────────────────────────────────────────────────
  let mode: IntegrationMode;

  if (!isDev) {
    // Production: only "sura" or "standalone" — "sura-mock" is never allowed.
    const envMode = process.env.SURA_INTEGRATION_MODE;
    mode = envMode === "sura" ? "sura" : "standalone";
  } else {
    // Development: ?sura_mode=mock activates the mock bridge.
    const params = new URLSearchParams(window.location.search);
    mode = params.get("sura_mode") === "mock" ? "sura-mock" : "standalone";
  }

  // ── Parent origin ──────────────────────────────────────────────────────
  let parentOrigin = envOrigin;
  if (mode === "sura-mock" && !parentOrigin) {
    // Game and test-host are both served from the same origin in dev.
    parentOrigin = window.location.origin;
  }

  // ── Validation for real sura mode ─────────────────────────────────────
  // parentOrigin is required for postMessage security (origin-pinning).
  // A missing value falls back to standalone so the game still loads visibly
  // rather than crashing with a blank screen.
  if (mode === "sura" && !parentOrigin) {
    console.error(
      "[SuraRuntimeConfig] SURA_PARENT_ORIGIN is required when " +
      "SURA_INTEGRATION_MODE=sura. Falling back to standalone mode.",
    );
    mode = "standalone";
  }

  // apiBaseUrl is not required for the parent-submit flow (the host
  // persists the score; the game only communicates via postMessage).

  return { mode, gameId, gameVersion, parentOrigin, apiBaseUrl: envBaseUrl, isEmbedded, isDev };
}

// Singleton — built once at module load time.
export const SURA_CONFIG: SuraConfig = buildConfig();

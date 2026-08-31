export interface LeaderboardEntry {
    rank:  number;
    alias: string;
    score: number;
}

export interface LeaderboardFetchParams {
    gameId?:     string | null;
    apiBaseUrl?: string | null;
}

interface ApiLeaderboardEntry {
    position:   number;
    alias:      string | null;
    best_score: number;
}

interface ApiLeaderboardResponse {
    data: {
        entries: ApiLeaderboardEntry[];
    };
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
    { rank: 1, alias: 'Fede_K', score: 4200 },
    { rank: 2, alias: 'Cami.R', score: 3150 },
    { rank: 3, alias: 'ElRey92', score: 2680 },
    { rank: 4, alias: 'Sofi_M', score: 2100 },
    { rank: 5, alias: 'Bruno.T', score: 1780 },
    { rank: 6, alias: 'Naty_G', score: 1500 },
    { rank: 7, alias: 'Lucas.V', score: 1290 },
    { rank: 8, alias: 'MoniOK', score: 980 },
];

/**
 * Real leaderboard, via SURA's public (unauthenticated) endpoint:
 * GET {apiBaseUrl}/minigames/v1/games/{gameId}/leaderboard?per_page=12.
 *
 * gameId/apiBaseUrl come from the host's own INIT_GAME payload (see
 * SuraIntegrationService.getGameId/getApiBaseUrl) — RankingScene reads them
 * from the service and passes them in here. Without a SURA session
 * (standalone mode, or before the handshake finishes) or on any fetch
 * failure, this falls back to the mock list — same approach as the sibling
 * Pengu Rush / Joystick Pop projects.
 */
export async function fetchLeaderboard(
    params?: LeaderboardFetchParams
): Promise<LeaderboardEntry[]> {
    if (!params?.gameId || !params?.apiBaseUrl) {
        return MOCK_LEADERBOARD;
    }

    try {
        const response = await fetch(
            `${params.apiBaseUrl}/minigames/v1/games/${params.gameId}/leaderboard?per_page=12`
        );

        if (!response.ok) {
            return MOCK_LEADERBOARD;
        }

        const body = (await response.json()) as ApiLeaderboardResponse;

        return body.data.entries.map((entry) => ({
            rank: entry.position,
            // The backend can send a null alias (player with no nickname) —
            // a generic placeholder, never a made-up name.
            alias: entry.alias ?? `Player ${entry.position}`,
            score: entry.best_score,
        }));
    } catch {
        return MOCK_LEADERBOARD;
    }
}

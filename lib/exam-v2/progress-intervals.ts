/** Client-side: how often to POST in-progress state to the server during a live exam. */
export const EXAM_SERVER_PROGRESS_INTERVAL_MS = 30_000;

/** ElevateX placement take — slightly faster for admin live board, still safe at 500+ students. */
export const ELEVATEX_SERVER_PROGRESS_INTERVAL_MS = 20_000;

/** Local sessionStorage draft interval (no server load). */
export const EXAM_LOCAL_DRAFT_INTERVAL_MS = 30_000;

/** Server autosave route interval (legacy exam/attempts autosave). */
export const EXAM_LEGACY_AUTOSAVE_INTERVAL_MS = 120_000;

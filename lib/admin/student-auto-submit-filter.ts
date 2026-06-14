/** Client-safe auto-submit filter helpers (no DB imports). */

export function studentMatchesAutoSubmitFilter(user: {
  has_auto_submit?: boolean;
  auto_submit_count?: number;
  zero_score_auto_submit_count?: number;
  logged_in_with_auto_submit?: boolean;
}): boolean {
  return Boolean(
    user.has_auto_submit ||
      (user.auto_submit_count ?? 0) > 0 ||
      (user.zero_score_auto_submit_count ?? 0) > 0 ||
      user.logged_in_with_auto_submit,
  );
}

const MAX_PROCTOR_VIOLATIONS = 40;
const MAX_JSON_BYTES = 900_000;

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/** Trim bulky exam payloads before RDS persist (avoids Vercel 4.5MB body / JSON column limits). */
export function sanitizeAnswersForPersist(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...answers };

  const proctor = out.__proctor;
  if (proctor && typeof proctor === 'object') {
    const row = { ...(proctor as Record<string, unknown>) };
    const violations = row.violations;
    if (Array.isArray(violations) && violations.length > MAX_PROCTOR_VIOLATIONS) {
      row.violations = violations.slice(-MAX_PROCTOR_VIOLATIONS);
    }
    out.__proctor = row;
  }

  if (jsonByteLength(out) > MAX_JSON_BYTES) {
    const slim: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(out)) {
      if (key.startsWith('__')) {
        slim[key] = value;
        continue;
      }
      if (!value || typeof value !== 'object') {
        slim[key] = value;
        continue;
      }
      const row = value as Record<string, unknown>;
      slim[key] = {
        questionId: row.questionId ?? key,
        userAnswer: row.userAnswer ?? null,
        isMarkedForReview: Boolean(row.isMarkedForReview),
      };
    }
    if (jsonByteLength(slim) <= MAX_JSON_BYTES) return slim;
    return {
      _type: out._type,
      __placement: out.__placement,
      __proctor: out.__proctor,
      scorecard: out.scorecard,
    };
  }

  return out;
}

-- Authoritative Arena journey mission → DSA day mapping (additive only).
-- Day IDs are resolved at runtime seed (ensureJourneyMissionMappings), not hardcoded here.

CREATE TABLE IF NOT EXISTS "dsa_journey_missions" (
  "id" UUID NOT NULL,
  "mission_key" TEXT NOT NULL,
  "topic_key" TEXT NOT NULL,
  "day_id" UUID NOT NULL,
  "focus_problem_slug" TEXT,
  "sort_order" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dsa_journey_missions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dsa_journey_missions_mission_key_key"
  ON "dsa_journey_missions"("mission_key");

CREATE INDEX IF NOT EXISTS "dsa_journey_missions_topic_key_idx"
  ON "dsa_journey_missions"("topic_key");

CREATE INDEX IF NOT EXISTS "dsa_journey_missions_day_id_idx"
  ON "dsa_journey_missions"("day_id");

CREATE INDEX IF NOT EXISTS "dsa_journey_missions_is_active_idx"
  ON "dsa_journey_missions"("is_active");

DO $$
BEGIN
  ALTER TABLE "dsa_journey_missions"
    ADD CONSTRAINT "dsa_journey_missions_day_id_fkey"
    FOREIGN KEY ("day_id") REFERENCES "dsa_days"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

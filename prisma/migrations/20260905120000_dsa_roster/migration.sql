-- DSA roll roster (who may open the DSA practice track)
CREATE TABLE IF NOT EXISTS "dsa_roster" (
  "id" UUID NOT NULL,
  "roll_number" TEXT NOT NULL,
  "full_name" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dsa_roster_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "dsa_roster_roll_number_key" ON "dsa_roster"("roll_number");
CREATE INDEX IF NOT EXISTS "dsa_roster_is_active_idx" ON "dsa_roster"("is_active");

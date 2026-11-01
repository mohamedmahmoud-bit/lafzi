-- Completing rounds earned at most 60 XP a day (≈4 games), so active students stopped seeing XP.
-- Raise to 200 unless an admin already changed it.
UPDATE "xp_rules" SET "daily_cap" = 200, "updated_at" = now() WHERE "action" = 'game_completed' AND "daily_cap" = 60;

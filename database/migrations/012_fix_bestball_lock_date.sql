-- Fix Best Ball contest lock_date to 30 minutes before R64 tip-off (March 19, 2026 12:15 PM ET)
UPDATE best_ball_contests
SET lock_date = '2026-03-19T11:45:00-04:00'
WHERE status = 'open'
  AND lock_date > '2026-03-19T12:15:00-04:00';

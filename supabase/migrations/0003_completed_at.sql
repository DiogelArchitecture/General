-- Record exactly when a mission was marked done, so the reveal can show
-- "they did this around 3:15pm" — a small narrative beat without asking the
-- guesser to pick a time. Set by /api/mission/complete on the doer's tap.
alter table tasks add column if not exists completed_at timestamptz;

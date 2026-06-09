-- B1: When the guesser writes a free-text guess (e.g. "phones down to listen"),
-- we now ask Claude to compare it to the actual mission and produce a one-line
-- warm acknowledgement that the reveal can show. The structured is_correct
-- flag stays the source of truth for streaks/stats (themes only); guess_note
-- is purely for warmth at reveal time.
alter table guesses add column if not exists guess_note text;

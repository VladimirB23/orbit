-- The journal without what was undone, each event with its local day.
--
-- An undo is an action too: it names the action it takes back in `undoes`. A redo takes back
-- an undo. An undo nobody has redone is in force: it and its victim never happened.
CREATE TEMP VIEW IF NOT EXISTS events_in_force AS
WITH undone AS (
    SELECT DISTINCT u.batch, u.undoes
    FROM events AS u
    WHERE u.undoes IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM events AS r WHERE r.undoes = u.batch)
),
dead AS (
    SELECT batch FROM undone
    UNION
    SELECT undoes FROM undone
)
SELECT e.*, local_day(e.at) AS day
FROM events AS e
WHERE e.batch IS NULL                              -- before migration 0003: cannot be undone
   OR e.batch NOT IN (SELECT batch FROM dead)

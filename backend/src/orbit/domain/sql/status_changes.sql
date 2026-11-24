-- Every status a row has entered, the one it was born with included.
--
-- UNION ALL puts births and later changes into one list: afterwards nobody has to remember
-- that the first status lives in a different kind of event.
CREATE TEMP VIEW IF NOT EXISTS status_changes AS
SELECT
    born_id     AS event_id,
    born_batch  AS batch,
    entity,
    entity_id,
    born_day    AS day,
    NULL        AS old_status,
    born_status AS status,
    1           AS is_birth
FROM lives
UNION ALL
SELECT e.id, e.batch, e.entity, e.entity_id, e.day, e.old_value, e.new_value, 0
FROM events_in_force AS e
JOIN lives AS l ON l.entity = e.entity AND l.entity_id = e.entity_id
WHERE e.action = 'update'
  AND e.field = 'status'
  AND e.id > l.born_id                             -- not of an earlier row with the same id

-- The birth of every row that exists now or existed before.
--
-- SQLite gives the id of a deleted row to the next one, so one id may have several births.
-- ROW_NUMBER numbers them from the newest: number 1 is the birth of the present row.
CREATE TEMP VIEW IF NOT EXISTS lives AS
WITH births AS (
    SELECT
        entity,
        entity_id,
        id    AS born_id,
        batch AS born_batch,
        day   AS born_day,
        json_extract(new_value, '$.status')   AS born_status,
        json_extract(new_value, '$.due_date') AS born_due,
        ROW_NUMBER() OVER (PARTITION BY entity, entity_id ORDER BY id DESC) AS from_last
    FROM events_in_force
    WHERE action = 'create'
)
SELECT entity, entity_id, born_id, born_batch, born_day, born_status, born_due
FROM births
WHERE from_last = 1

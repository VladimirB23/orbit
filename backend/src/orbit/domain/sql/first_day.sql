-- The first day anything is known of: the beginning of "all time".
SELECT MIN(day)
FROM (
    SELECT MIN(day) AS day FROM activity_facts
    UNION ALL
    SELECT MIN(day) FROM events_in_force
)

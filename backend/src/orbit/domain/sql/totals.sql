-- Amounts of the period and of the one before it, plus the first day each kind is known from.
--
-- Two periods in one pass: the same SUM with a different FILTER. The first day tells "zero"
-- from "there was no journal yet", so it looks at all projects, whatever the filter.
WITH kinds AS (
    SELECT
        kind,
        COALESCE(SUM(amount) FILTER (WHERE day BETWEEN :start AND :end), 0) AS now,
        COALESCE(SUM(amount) FILTER (WHERE day BETWEEN :before_start AND :before_end), 0) AS before
    FROM activity_facts
    WHERE :project IS NULL OR project_id = :project
    GROUP BY kind
),
beginnings AS (
    SELECT 'session' AS kind, MIN(local_day(started_at)) AS first_day FROM sessions
    UNION ALL
    SELECT 'commit', MIN(local_day(committed_at)) FROM commits
    UNION ALL
    SELECT 'closed', MIN(day) FROM events_in_force   -- tasks are known since the journal is kept
    UNION ALL
    SELECT 'prompt', NULL
    UNION ALL
    SELECT 'born_closed', NULL
)
SELECT b.kind, COALESCE(k.now, 0) AS now, COALESCE(k.before, 0) AS before, b.first_day
FROM beginnings AS b
LEFT JOIN kinds AS k ON k.kind = b.kind

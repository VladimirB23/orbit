-- Amounts by step of time (day, week or month) and project, empty steps included.
--
-- A recursive CTE makes the calendar: the first step, then "the previous one plus a stride"
-- until the end. Without it weeks with no work would silently vanish from the chart.
-- '-6 days', 'weekday 1' is the SQLite way to the Monday of the week.
WITH RECURSIVE calendar(step) AS (
    SELECT :first
    UNION ALL
    SELECT date(step, :stride) FROM calendar WHERE date(step, :stride) <= :end
),
stepped AS (
    SELECT
        CASE :unit
            WHEN 'day'  THEN day
            WHEN 'week' THEN date(day, '-6 days', 'weekday 1')
            ELSE date(day, 'start of month')
        END AS step,
        project_id, kind, SUM(amount) AS amount
    FROM activity_facts
    WHERE day BETWEEN :start AND :end
      AND (:project IS NULL OR project_id = :project)
    GROUP BY 1, 2, 3
)
SELECT c.step, p.slug, p.name, s.kind, s.amount
FROM calendar AS c
LEFT JOIN stepped  AS s ON s.step = c.step
LEFT JOIN projects AS p ON p.id = s.project_id
ORDER BY c.step, p.position, p.id

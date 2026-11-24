-- One row per task with the days it passed its marks (an "accumulating snapshot" in BI words).
--
-- FILTER inside an aggregate counts only the rows it needs, so one pass over the changes
-- gives both the first day in work and the number of statuses.
CREATE TEMP VIEW IF NOT EXISTS task_facts AS
WITH marks AS (
    SELECT
        entity_id AS task_id,
        MIN(day) FILTER (WHERE status = 'in_progress') AS started,
        COUNT(*) AS statuses
    FROM status_changes
    WHERE entity = 'task'
    GROUP BY entity_id
),
dated AS (
    SELECT
        t.*,
        local_day(t.created_at) AS created,
        m.started,
        CASE WHEN t.status = 'done' THEN local_day(t.done_at) END AS done,
        -- Written down when it was over already: it says nothing about the pace.
        t.status = 'done' AND l.born_status = 'done' AND m.statuses = 1 AS born_closed
    FROM tasks AS t
    LEFT JOIN lives AS l ON l.entity = 'task' AND l.entity_id = t.id
    LEFT JOIN marks AS m ON m.task_id = t.id
)
SELECT
    id, project_id, milestone_id, parent_id, title, status, priority, due_date,
    created, started, done, born_closed,
    CASE
        WHEN started <= done THEN CAST(julianday(done) - julianday(started) AS INTEGER)
    END AS cycle_days                              -- NULL while any of the two is unknown
FROM dated

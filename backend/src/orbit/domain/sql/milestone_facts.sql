-- One row per milestone: the plan as it was known before the first closing, and the fact.
--
-- The deadline in the table may have been moved or even set after the work was over. The
-- journal remembers: the plan is the last deadline written before the closing action.
CREATE TEMP VIEW IF NOT EXISTS milestone_facts AS
WITH closings AS (
    SELECT
        entity_id AS milestone_id, event_id, batch,
        ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY event_id) AS n
    FROM status_changes
    WHERE entity = 'milestone' AND status = 'done' AND NOT is_birth
),
deadlines AS (
    SELECT
        c.milestone_id,
        e.new_value AS due,
        e.actor,
        ROW_NUMBER() OVER (PARTITION BY c.milestone_id ORDER BY e.id DESC) AS from_last,
        -- COUNT of a column skips NULLs: the first date ever set is not a move.
        COUNT(e.old_value) OVER (PARTITION BY c.milestone_id) AS moves
    FROM closings AS c
    JOIN lives AS l ON l.entity = 'milestone' AND l.entity_id = c.milestone_id
    JOIN events_in_force AS e
        ON e.entity = 'milestone' AND e.entity_id = c.milestone_id AND e.field = 'due_date'
    WHERE c.n = 1
      AND e.id > l.born_id
      AND e.id < c.event_id
      AND (e.batch IS NULL OR e.batch IS NOT c.batch)
),
dated AS (
    SELECT
        m.*,
        local_day(m.created_at) AS created,
        CASE WHEN m.status = 'done' THEN local_day(m.done_at) END AS done,
        m.status = 'done' AND l.born_status = 'done' AND c.milestone_id IS NULL AS born_closed,
        CASE WHEN p.milestone_id IS NULL THEN l.born_due ELSE p.due END AS plan_due,
        COALESCE(p.actor = 'system' AND p.due IS NOT NULL, 0) AS automatic,
        COALESCE(p.moves, 0) AS moves
    FROM milestones AS m
    LEFT JOIN lives AS l ON l.entity = 'milestone' AND l.entity_id = m.id
    LEFT JOIN closings AS c ON c.milestone_id = m.id AND c.n = 1
    LEFT JOIN deadlines AS p ON p.milestone_id = m.id AND p.from_last = 1
)
SELECT
    id, project_id, name, status, due_date, created, done, born_closed, plan_due, automatic, moves,
    CASE
        WHEN done IS NULL THEN 'open'
        WHEN born_closed THEN 'born_closed'
        WHEN plan_due IS NOT NULL THEN 'compared'
        WHEN due_date IS NOT NULL THEN 'set_after'
        ELSE 'no_due'
    END AS plan_state,
    CASE
        WHEN done IS NOT NULL AND NOT born_closed AND plan_due IS NOT NULL
        THEN CAST(julianday(done) - julianday(plan_due) AS INTEGER)
    END AS days_late                               -- below zero: earlier than planned
FROM dated

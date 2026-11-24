-- Where attention goes: sessions, commits and closed tasks of every project in the period.
--
-- SUM(...) OVER () is a window over the whole result: every row sees the totals without a second
-- query. The project filter is applied last, so a share stays a share of everything.
WITH amounts AS (
    SELECT
        project_id,
        SUM(amount) FILTER (WHERE kind = 'session') AS sessions,
        SUM(amount) FILTER (WHERE kind = 'prompt')  AS prompts,
        SUM(amount) FILTER (WHERE kind = 'commit')  AS commits,
        SUM(amount) FILTER (WHERE kind = 'closed')  AS closed
    FROM activity_facts
    WHERE day BETWEEN :start AND :end
    GROUP BY project_id
),
statuses AS (
    SELECT
        project_id,
        COUNT(*) FILTER (WHERE status = 'done')                   AS done,
        COUNT(*) FILTER (WHERE status = 'in_progress')            AS working,
        COUNT(*) FILTER (WHERE status IN ('paused', 'blocked'))   AS stuck,
        COUNT(*) FILTER (WHERE status IN ('backlog', 'planned'))  AS ahead
    FROM tasks
    GROUP BY project_id
),
moves AS (                                         -- what counts as movement, of any kind
    SELECT project_id, day FROM activity_facts WHERE kind IN ('session', 'commit')
    UNION ALL
    SELECT COALESCE(p.id, m.project_id, t.project_id), c.day
    FROM status_changes AS c
    LEFT JOIN projects   AS p ON c.entity = 'project'   AND p.id = c.entity_id
    LEFT JOIN milestones AS m ON c.entity = 'milestone' AND m.id = c.entity_id
    LEFT JOIN tasks      AS t ON c.entity = 'task'      AND t.id = c.entity_id
    WHERE NOT c.is_birth
),
last_moves AS (
    SELECT project_id, MAX(day) AS last_day FROM moves WHERE day <= :today GROUP BY project_id
),
shares AS (
    SELECT
        p.id, p.slug, p.name, p.status, p.priority, p.position,
        p.archived_at IS NOT NULL AS archived,
        COALESCE(a.sessions, 0) AS sessions,
        COALESCE(a.prompts, 0)  AS prompts,
        COALESCE(a.commits, 0)  AS commits,
        COALESCE(a.closed, 0)   AS closed,
        COALESCE(SUM(a.sessions) OVER (), 0) AS all_sessions,
        COALESCE(SUM(a.commits) OVER (), 0)  AS all_commits,
        EXISTS (SELECT 1 FROM commits AS c WHERE c.project_id = p.id) AS has_code,
        COALESCE(s.done, 0)    AS done,
        COALESCE(s.working, 0) AS working,
        COALESCE(s.stuck, 0)   AS stuck,
        COALESCE(s.ahead, 0)   AS ahead,
        l.last_day
    FROM projects AS p
    LEFT JOIN amounts    AS a ON a.project_id = p.id
    LEFT JOIN statuses   AS s ON s.project_id = p.id
    LEFT JOIN last_moves AS l ON l.project_id = p.id
)
SELECT *
FROM shares
WHERE (:project IS NULL OR id = :project)
  AND (
      sessions + commits + closed > 0
      OR (NOT archived AND status NOT IN ('done', 'canceled'))
      OR id = :project
  )
ORDER BY sessions DESC, commits DESC, closed DESC, position, id

-- What priorities ask for. Sessions and commits of a day are shared among the projects that were
-- under way on that day, in proportion to priority; then the days are added up.
--
-- Day by day, because a project of three weeks must not look neglected over three months, and
-- time spent on finished projects must not be asked of the running ones. Nothing is asked of a
-- future project: it is only talked about.
-- SUM(weight) OVER (PARTITION BY day, kind) is the total of a group next to every row of it.
WITH signs AS (                                    -- days that prove work on a project
    SELECT project_id, day FROM activity_facts WHERE kind IN ('session', 'commit')
    UNION ALL
    SELECT entity_id, day FROM status_changes WHERE entity = 'project' AND status = 'in_progress'
),
spans AS (
    SELECT
        p.id                 AS project_id,
        MAX(p.priority, 1)   AS weight,            -- no priority weighs as much as the lowest
        MIN(s.day)           AS first_day,
        CASE WHEN p.status = 'in_progress' THEN :today ELSE MAX(s.day) END AS last_day,
        EXISTS (SELECT 1 FROM commits AS c WHERE c.project_id = p.id) AS has_code
    FROM projects AS p
    JOIN signs AS s ON s.project_id = p.id
    WHERE p.id NOT IN (SELECT project_id FROM future_projects)
    GROUP BY p.id
),
days AS (
    SELECT day, kind, SUM(amount) AS total
    FROM activity_facts
    WHERE kind IN ('session', 'commit') AND day BETWEEN :start AND :end
    GROUP BY day, kind
),
parts AS (
    SELECT
        d.kind,
        s.project_id,
        1.0 * d.total * s.weight / SUM(s.weight) OVER (PARTITION BY d.day, d.kind) AS part
    FROM days AS d
    JOIN spans AS s ON d.day BETWEEN s.first_day AND s.last_day
    WHERE d.kind = 'session' OR s.has_code         -- commits are expected only where there is code
)
SELECT p.slug, parts.kind, SUM(part) / SUM(SUM(part)) OVER (PARTITION BY parts.kind) AS expected
FROM parts
JOIN projects AS p ON p.id = parts.project_id
GROUP BY p.slug, parts.kind

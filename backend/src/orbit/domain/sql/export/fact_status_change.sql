-- COALESCE takes the first value that is not NULL: a change belongs to exactly one of the three.
SELECT
    c.event_id AS change_id,
    c.day      AS date,
    c.entity,
    c.entity_id,
    COALESCE(p.id, m.project_id, t.project_id) AS project_id,
    c.old_status,
    c.status,
    c.actor,
    c.is_birth
FROM status_changes AS c
LEFT JOIN projects   AS p ON c.entity = 'project'   AND p.id = c.entity_id
LEFT JOIN milestones AS m ON c.entity = 'milestone' AND m.id = c.entity_id
LEFT JOIN tasks      AS t ON c.entity = 'task'      AND t.id = c.entity_id
WHERE COALESCE(p.id, m.project_id, t.project_id) IS NOT NULL   -- deleted rows leave events behind
ORDER BY c.event_id

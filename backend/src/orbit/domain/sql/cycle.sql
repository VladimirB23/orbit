-- Tasks closed in the period: how many days each was in work.
SELECT f.id, f.title, p.slug, f.started, f.done, f.cycle_days, f.born_closed
FROM task_facts AS f
JOIN projects AS p ON p.id = f.project_id
WHERE f.done BETWEEN :start AND :end
  AND (:project IS NULL OR f.project_id = :project)
ORDER BY f.done, f.id

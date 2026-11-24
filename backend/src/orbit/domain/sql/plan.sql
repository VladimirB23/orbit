-- Milestones closed in the period: the plan against the fact, newest first.
SELECT
    f.id, f.name, p.slug, f.plan_due, f.done, f.days_late, f.moves, f.automatic, f.plan_state
FROM milestone_facts AS f
JOIN projects AS p ON p.id = f.project_id
WHERE f.done BETWEEN :start AND :end
  AND (:project IS NULL OR f.project_id = :project)
ORDER BY f.done DESC, f.id DESC

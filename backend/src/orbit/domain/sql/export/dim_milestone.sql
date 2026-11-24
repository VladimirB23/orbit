-- Milestones as they are now.
SELECT id AS milestone_id, project_id, name AS milestone, position, status
FROM milestones
ORDER BY id

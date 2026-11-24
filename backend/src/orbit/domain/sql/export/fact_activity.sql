-- The long list of the screen, added up by day.
SELECT day AS date, project_id, kind, SUM(amount) AS amount
FROM activity_facts
GROUP BY day, project_id, kind
HAVING SUM(amount) > 0
ORDER BY day, project_id, kind

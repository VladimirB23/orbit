-- Everything that can be counted by day and project, in one long list: kind and amount.
--
-- A long list instead of a wide table: a new measure is one more SELECT, the queries that add
-- things up do not change. The length of a session is left out on purpose: a session may stay
-- open for days (ADR 0004). Commits come from git, not from the session journals (ADR 0007).
-- COALESCE: a session counts once, for the project it was about, not for the one it ran in.
CREATE TEMP VIEW IF NOT EXISTS activity_facts AS
SELECT
    local_day(started_at) AS day, COALESCE(topic_id, project_id) AS project_id,
    'session' AS kind, 1 AS amount
FROM sessions
UNION ALL
SELECT local_day(started_at), COALESCE(topic_id, project_id), 'prompt', prompts FROM sessions
UNION ALL
SELECT local_day(committed_at), project_id, 'commit', 1 FROM commits
UNION ALL
SELECT done, project_id, CASE WHEN born_closed THEN 'born_closed' ELSE 'closed' END, 1
FROM task_facts
WHERE done IS NOT NULL

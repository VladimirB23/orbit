-- Projects that are only talked about: no folder to work in yet and not closed.
--
-- Not a column: the folder already says it, and two records of one fact end up different.
-- The same rule is is_future() in Python; a test compares them.
CREATE TEMP VIEW IF NOT EXISTS future_projects AS
SELECT id AS project_id
FROM projects
WHERE repo_path IS NULL AND status NOT IN ('done', 'canceled')

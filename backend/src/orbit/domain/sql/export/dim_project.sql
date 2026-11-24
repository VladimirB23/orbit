-- Projects as they are now.
SELECT
    id   AS project_id,
    name AS project,
    slug,
    status,
    priority,
    CASE priority
        WHEN 4 THEN 'Срочно' WHEN 3 THEN 'Высокий' WHEN 2 THEN 'Средний' WHEN 1 THEN 'Низкий'
        ELSE 'Без приоритета'
    END AS priority_name,
    start_date,
    due_date,
    local_day(created_at) AS created_date,
    CASE WHEN status = 'done' THEN local_day(done_at) END AS done_date,
    archived_at IS NOT NULL AS is_archived
FROM projects
ORDER BY id

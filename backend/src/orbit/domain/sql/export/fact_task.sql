SELECT
    id    AS task_id,
    title AS task,
    project_id,
    milestone_id,
    status,
    priority,
    created AS created_date,
    started AS started_date,
    done    AS done_date,
    due_date,
    cycle_days,
    COALESCE(born_closed, 0) AS is_born_closed
FROM task_facts
ORDER BY id

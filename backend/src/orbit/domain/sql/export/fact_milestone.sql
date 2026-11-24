SELECT
    id   AS milestone_id,
    name AS milestone,
    project_id,
    status,
    created  AS created_date,
    plan_due AS plan_due_date,
    done     AS done_date,
    days_late,
    moves     AS due_moves,
    automatic AS is_plan_automatic,
    plan_state
FROM milestone_facts
ORDER BY id

-- A calendar without holes over every date that is met in any fact.
-- strftime('%w') counts from Sunday = 0; (n + 6) % 7 + 1 makes Monday 1 and Sunday 7.
WITH RECURSIVE met AS (
    SELECT day AS d FROM activity_facts
    UNION ALL SELECT day FROM status_changes
    UNION ALL SELECT created FROM task_facts
    UNION ALL SELECT started FROM task_facts
    UNION ALL SELECT due_date FROM task_facts
    UNION ALL SELECT created FROM milestone_facts
    UNION ALL SELECT plan_due FROM milestone_facts
    UNION ALL SELECT done FROM milestone_facts
    UNION ALL SELECT start_date FROM projects
    UNION ALL SELECT due_date FROM projects
),
ends AS (
    SELECT MIN(d) AS first, MAX(d) AS last FROM met WHERE d IS NOT NULL
),
calendar(date) AS (
    SELECT first FROM ends WHERE first IS NOT NULL
    UNION ALL
    SELECT date(date, '+1 day') FROM calendar, ends WHERE date < last
)
SELECT
    date,
    CAST(strftime('%Y', date) AS INTEGER) AS year,
    strftime('%Y', date) || '-Q' || ((CAST(strftime('%m', date) AS INTEGER) + 2) / 3) AS quarter,
    date(date, 'start of month') AS month,
    date(date, '-6 days', 'weekday 1') AS week_start,
    (CAST(strftime('%w', date) AS INTEGER) + 6) % 7 + 1 AS weekday,
    strftime('%w', date) IN ('0', '6') AS is_weekend
FROM calendar

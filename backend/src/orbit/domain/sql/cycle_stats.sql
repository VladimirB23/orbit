-- Median and 85th percentile of the cycle time. SQLite has no MEDIAN: window functions do it.
--
-- Rows are numbered by length. The median is the middle row, or the mean of the two middle ones:
-- for 5 rows both formulas give 3, for 4 rows they give 2 and 3 (integer division).
-- The 85th percentile: the shortest time that at least 85% of tasks have fitted into.
WITH ranked AS (
    SELECT
        cycle_days,
        ROW_NUMBER() OVER (ORDER BY cycle_days) AS n,
        COUNT(*) OVER () AS total
    FROM task_facts
    WHERE cycle_days IS NOT NULL
      AND done BETWEEN :start AND :end
      AND (:project IS NULL OR project_id = :project)
)
SELECT
    AVG(cycle_days) FILTER (WHERE n IN ((total + 1) / 2, (total + 2) / 2)) AS median,
    MIN(cycle_days) FILTER (WHERE n >= 0.85 * total) AS p85
FROM ranked

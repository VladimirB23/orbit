-- A small dimension typed in by hand: VALUES makes a table out of constants.
WITH statuses(status, status_name, status_group, sort_order) AS (
    VALUES
        ('done',        'Готово',        'done',     1),
        ('in_progress', 'В работе',      'working',  2),
        ('paused',      'На паузе',      'stuck',    3),
        ('blocked',     'Заблокировано', 'stuck',    4),
        ('planned',     'Запланировано', 'ahead',    5),
        ('backlog',     'Идея',          'ahead',    6),
        ('canceled',    'Отменено',      'canceled', 7)
)
SELECT status, status_name, status_group, sort_order
FROM statuses
ORDER BY sort_order

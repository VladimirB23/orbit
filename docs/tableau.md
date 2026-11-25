# Дашборд в Tableau Public: пошагово

Здесь источники, связи, формулы, листы и выводы с проверенными числами.
Кнопки и меню названы по-английски, как в программе.

> **Публиковать можно только демо.** Tableau Public показывает все сохраненное всем. Выгрузка живой базы
> лежит рядом с файлом `PRIVATE.txt`: увидел его в папке - не открывай ее в Tableau Public.

## 1. Данные

Уже выгружены в `out/tableau` (папка в `.gitignore`). Повторить:

```powershell
orbit seed --demo --half-year --until 2026-11-25 --reset
orbit --db data/demo-half-year.db export --csv out/tableau
```

`--until` замораживает последний день: та же дата дает те же файлы до байта, и опубликованный дашборд
можно пересобрать. Что в каждом поле: `out/tableau/DICTIONARY.md`, открой рядом.

Выгрузка - **звезда**: факты (`fact_*`, события и числа) в центре, измерения (`dim_*`, чем эти числа режут)
вокруг. У каждого факта свое зерно (grain) - что значит одна строка. Зерно записано в словаре.

## 2. Контрольные числа

Сверяй до сборки листов и после каждой связи. Не сошлось - ошибка в связи, а не в данных.

| Проверка | Должно быть |
| --- | --- |
| Сессии: сумма `amount` при `kind = session` | 189 |
| Коммиты: сумма `amount` при `kind = commit` | 379 |
| Закрытые задачи: сумма `amount` при `kind = closed` | 161 |
| Строк в `fact_task` | 186 |
| Задач с известным `cycle_days` | 152 |
| Закрыты без статуса "в работе" / созданы сразу закрытыми | 9 / 5 |
| Этапов с заполненным `days_late` | 33, из них опоздали 9 |

152 + 9 = 161: созданные сразу закрытыми в cycle time и темп не входят.

## 3. Источники и связи

Нужен Tableau Desktop Public Edition (бесплатный, скачивается с public.tableau.com). Что в нем есть, чего
нет и какие лимиты: [сравнение редакций](https://help.tableau.com/current/pro/desktop/en-us/desktop_comparison.htm)
и [FAQ](https://help.tableau.com/current/pro/desktop/en-us/public_faq.htm).

Сделай **три источника данных**, в каждом одна таблица фактов:

| Источник | Центр | Связи (Relationships) |
| --- | --- | --- |
| Activity | `fact_activity` | `dim_project`: `project_id`; `dim_date`: `date` |
| Tasks | `fact_task` | `dim_project`: `project_id`; `dim_milestone`: `milestone_id`; `dim_status`: `status`; `dim_date`: `done_date = date` |
| Milestones | `fact_milestone` | `dim_project`: `project_id`; `dim_date`: `done_date = date` |

1. `Connect > Text file`, выбери `fact_activity.csv`.
2. Из левой панели `Files` перетащи `dim_project.csv` на холст. Между таблицами появится линия - это связь.
   Проверь поля в `Edit Relationship`. Так же `dim_date.csv`.
3. Щелкни правой кнопкой по таблице, `Text File Properties`: `Field separator` - Comma, `Character Set` - UTF-8.
4. Типы: все поля `date`, `*_date`, `month`, `week_start` - Date; `*_id` и `weekday` - перенеси в Dimensions
   (`Convert to Dimension`), складывать номера нельзя.
5. `Data > New Data Source` и повтори для двух других.
6. Переименуй источники: правый клик по имени вверху слева.

**Почему связь, а не join.** Join склеивает строки заранее. Если соединить `fact_task` и `fact_activity` по
`project_id`, каждая задача повторится столько раз, сколько у проекта дней активности, и суммы вырастут в
десятки раз. Это называется fan-out. Связь считает каждую таблицу в ее зерне и соединяет уже результаты
([о связях](https://help.tableau.com/current/pro/desktop/en-us/relate_tables.htm)).

**Почему три источника.** Tableau советует одну таблицу фактов в центре. Модель с несколькими фактами
существует ([multi-fact](https://help.tableau.com/current/pro/desktop/en-us/datasource_mfr_multiple_base_tables.htm)),
но для первого дашборда три простых источника понятнее, а общий фильтр по проекту все равно работает (шаг 6).

## 4. Расчетные поля

`Analysis > Create Calculated Field`. Имена полей бери из своей панели данных: Tableau может показать
`project_id` как `Project Id`.

**Источник Activity**

| Имя | Формула | Почему так |
| --- | --- | --- |
| Sessions | `IIF([Kind] = "session", [Amount], 0)` | Уровень строки: из длинного списка делаем меру. Складывает ее потом `SUM` на листе |
| Commits | `IIF([Kind] = "commit", [Amount], 0)` | То же |
| Closed | `IIF([Kind] = "closed", [Amount], 0)` | `born_closed` не берем: это запись прошлого |
| Share of sessions | `SUM([Sessions]) / MIN({ FIXED : SUM([Sessions]) })` | `FIXED` без полей - одно число на все данные. Оно стоит в каждой строке, поэтому сверху `MIN`, а не `SUM` |
| Share of commits | `SUM([Commits]) / MIN({ FIXED : SUM([Commits]) })` | То же |
| Attention | `([Share of sessions] + [Share of commits]) / 2` | Как в orbit: среднее двух долей |

`FIXED` считается раньше обычных фильтров. Чтобы фильтр по датам на него действовал: правый клик по фильтру,
`Add to Context` ([порядок операций](https://help.tableau.com/current/pro/desktop/en-us/order_of_operations.htm)).

**Источник Tasks**

| Имя | Формула | Почему так |
| --- | --- | --- |
| Really closed | `[Status] = "done" AND [Is Born Closed] = 0` | Фильтр для темпа |
| Period | `IF [Done Date] < #2026-09-01# THEN "Jun-Aug" ELSE "Sep-Nov" END` | Две половины для сравнения |
| Median cycle | `MEDIAN([Cycle Days])` | Середина ряда: пара задач по 20 дней ее не сдвинет, а среднее сдвинет |
| P85 cycle | `PERCENTILE([Cycle Days], 0.85)` | За сколько успевают 85% задач: честнее обещать это |

Пустые `cycle_days` агрегаты пропускают сами. Не заменяй их нулем: `ZN()` превратит "неизвестно" в
"мгновенно".

**Источник Milestones**

| Имя | Формула | Почему так |
| --- | --- | --- |
| Result | `IF [Days Late] > 0 THEN "Late" ELSEIF [Days Late] <= 0 THEN "On time" END` | У пустых результат пустой, они отфильтруются |
| On-time rate | `SUM(IIF([Days Late] <= 0, 1, 0)) / COUNT([Days Late])` | `COUNT` поля не считает пустые: знаменатель 33, а не 37 |
| Kind of milestone | `IF STARTSWITH([Milestone], "Data") THEN "Data" ELSE "Other" END` | Проверяем догадку про работу с данными |

## 5. Листы

| # | Лист | Источник | Сборка |
| --- | --- | --- | --- |
| 1 | KPI (4 листа) | все | `Marks > Text`: `SUM(Sessions)`, `SUM(Commits)`, `Median cycle`, `On-time rate` (формат Percentage). Шрифт 28+, подпись мельче |
| 2 | Focus by project | Activity | `Rows`: Project, `Columns`: Attention; сортировка по убыванию. Priority Name на `Color` (серый, у "Срочно" - акцент) |
| 3 | Where attention went | Activity | `Columns`: `WEEK(Date)` дискретная, `Rows`: Project, `Marks > Square`, `SUM(Sessions)` на `Color` и `Label`. Палитра одного тона ([highlight table](https://help.tableau.com/current/pro/desktop/en-us/buildexamples_highlight.htm)) |
| 4 | Throughput | Activity | `Columns`: `WEEK(Date)`, `Rows`: `SUM(Closed)`, Bar. Линия среднего: `Analytics > Average Line` ([reference lines](https://help.tableau.com/current/pro/desktop/en-us/reference_lines.htm)) |
| 5 | Cycle time | Tasks | Фильтр Really closed = True. `Columns`: Period, `Rows`: Cycle Days (убери агрегацию: `Analysis > Aggregate Measures`), Circle; затем `Analytics > Box Plot` |
| 6 | Plan vs fact | Milestones | Фильтр: Days Late не Null. `Columns`: `SUM(Days Late)`, `Rows`: Project, Milestone; Result на `Color`; сортировка по убыванию |
| 7 | Data vs other | Milestones | `Columns`: Kind of milestone, `Rows`: `AVG(Days Late)`; `COUNT(Days Late)` в `Tooltip` |

`WEEK` начинается с воскресенья или понедельника по настройке: правый клик по источнику,
`Date Properties > Week start: Monday`. Надежнее брать готовое поле `Week Start` из `dim_date`.

## 6. Дашборд

1. `Dashboard > New Dashboard`, `Size: Fixed size` 1200 x 900: на Tableau Public не разъедется.
2. Сверху заголовок-вывод, не "Дашборд проектов". Например: `Work got faster, but data milestones still run late`.
3. Ряд плиток (KPI), под ним слева Focus by project и Where attention went, справа Throughput и Cycle time,
   внизу Plan vs fact и Data vs other. Собирай в `Horizontal` и `Vertical` контейнерах, не `Floating`.
4. Фильтр по проекту: на любом листе положи `Project` на Filters, `Show Filter`, затем правый клик по нему,
   `Apply to Worksheets > All Using Related Data Sources`. Поля должны называться одинаково во всех трех
   источниках ([фильтр через источники](https://help.tableau.com/current/pro/desktop/en-us/filter_across_datasources.htm)).
5. Фильтр по датам: `Date` из Activity. На Tasks и Milestones он не действует (там другая дата), поэтому
   подпиши его "Activity period".
6. Действие: `Dashboard > Actions > Add Action > Filter`, источник Focus by project, цель - остальные листы.
7. Подсказки (Tooltip) перепиши словами: `<Project>: <SUM(Sessions)> sessions, <SUM(Commits)> commits`.
8. Внизу строка: `Synthetic data generated by orbit, not real work`. Без нее выводы были бы обманом.
9. Один акцентный цвет для главного, остальное серым, не больше 5-6 цветов
   ([best practices](https://help.tableau.com/current/pro/desktop/en-us/dashboards_best_practices.htm)).

## 7. Выводы

Числа посчитаны по этим же CSV. Получится другое - ищи ошибку в связях или фильтрах.

1. **Задачи стали быстрее вдвое.** Медиана cycle time: 7 дней у закрытых в июне-августе (41 задача) и 3 дня
   в сентябре-ноябре (111 задач).
2. **Опаздывает работа с данными.** Из 8 этапов Data collection и Data cleaning опоздали 7, в среднем на 10,5
   дня. Из 25 остальных опоздали 2, в среднем закрывались на 6,8 дня раньше срока.
3. **Перенос срока не помог.** Его двигали у 5 этапов, и все 5 все равно опоздали.
4. **Приоритет на словах.** У Job Search высший приоритет и 1 сессия из 189, зато Portfolio Site с низким
   приоритетом получил 23.

Осторожно с причинами:
- история придумана, и эти эффекты заложены в генератор (`backend/src/orbit/seed_history.py`). На
  дашборде это сказано прямо;
- вывод 1 может быть эффектом состава: в сентябре начались другие проекты. Проверь: положи Project на
  `Rows` листа 5 и посмотри, держится ли разница внутри одного проекта;
- 8 этапов - мало. Разница видна, но "доказано" говорить нельзя.

## 8. Перед публикацией

- [ ] В `out/tableau` нет `PRIVATE.txt`, в данных есть Coffee Shop Sales Dashboard, а настоящих проектов нет.
- [ ] Контрольные числа из раздела 2 сошлись.
- [ ] На дашборде есть строка про синтетические данные.
- [ ] Фильтры, действие и подсказки проверены, у чисел есть единицы.
- [ ] `File > Save to Tableau Public As...` - это и есть публикация, назад ее видно всем.
- [ ] Ссылка и снимок экрана - в README на этапе релиза.

## Полезное

- [Связи: как Tableau считает](https://help.tableau.com/current/pro/desktop/en-us/datasource_relationships_learnmorepage.htm)
- [Текстовые файлы и их свойства](https://help.tableau.com/current/pro/desktop/en-us/examples_text.htm)
- [FIXED](https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod_fixed.htm)
- [Табличные вычисления](https://help.tableau.com/current/pro/desktop/en-us/calculations_tablecalculations.htm)
- Как те же метрики считает сам orbit: [metrics.md](metrics.md)

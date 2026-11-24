# Orbit — PRD

v0.3 · 2026-11-24 · этапы 1 и 2 готовы; модель: `docs/adr/0002-data-model-rules.md`, API и интерфейс: `docs/adr/0003-api-and-ui.md`

## Проблема

Проекты, сессии с Claude, советы и решения разбросаны по папкам, чатам и заметкам. Нет одного
места, где за минуту видно: что в работе, на каком этапе, какие сроки, что подвисло и в каких проектах. []()

## Пользователи

- **Владелец**: смотрит статусы, планирует, правит руками в интерфейсе.
- **Claude** (общие сессии и сессии проектов): читает и обновляет данные сам через CLI, позже через MCP.

## Цели MVP

1. Одним взглядом видно все проекты и их этапы: статус, прогресс, сроки, короткий комментарий.
2. Claude меняет данные командой, интерфейс показывает изменение без перезагрузки.
3. Полный текст живет в Obsidian, из трекера заметка открывается в один клик (`obsidian://open`).
4. Каждое изменение пишется в журнал `events`. Это основа аналитики и история «кто что поменял».

**Не делаем:** логины, нескольких пользователей, облако, мобильное приложение, вложения.

## Модель данных

Иерархия как в Linear: **Project → Milestone (этап) → Task**, подзадачи через `parent_id`.

| Таблица | Поля |
|---|---|
| `projects` | id, slug (уникальный, = папка в `D:\Projects`), name, status, priority, start_date, due_date, summary (до 140 симв.), obsidian_path, repo_path, github_url, position, created_at, updated_at, done_at, archived_at |
| `milestones` | id, project_id, name, status, start_date, due_date, summary, position, created_at, updated_at, done_at |
| `tasks` | id, project_id, milestone_id?, parent_id?, title, status, priority, start_date, due_date, comment (до 280 симв.), position, created_at, updated_at, done_at |
| `events` | id, at, actor (`vladimir` / `claude` / `system`), entity, entity_id, action (`create` / `update` / `delete`), field, old_value, new_value |
| `sessions` (этап 3) | id, project_id, started_at, ended_at, title, prompts, files, commits — импорт журналов сессий Claude |

- **Статусы** (одни для всех уровней): `backlog` → `planned` → `in_progress` → `paused` / `blocked` → `done` / `canceled`.
  Переходы свободные; закрыть или удалить элемент с открытыми потомками можно только с `--force` (ADR 0002).
- **Приоритет:** 0–4 (none, low, medium, high, urgent), как в Linear.
- **Прогресс** этапа = done / (все − canceled) по задачам; этап без задач — по своему статусу.
- **Просрочено:** due_date < сегодня и статус не `done`/`canceled`.
- **Кто изменил:** CLI пишет `actor` из переменной `ORBIT_ACTOR` (для сессий Claude = `claude`), интерфейс — `vladimir`.

## Экраны MVP

1. **Дерево** (главный экран). Сверху сводка: в работе, заблокировано, просрочено, ближайшие 7 дней
   (нажатие фильтрует дерево); у свернутого проекта видны текущий этап и сигналы изнутри. Строки Project → Milestone → Task, раскрытие по клику и стрелкам.
   Колонки: название, статус, прогресс, старт, дедлайн, комментарий, Obsidian. Правка прямо в
   ячейке, быстрое добавление строки, фильтры (статус, просрочено, проект), поиск.
2. **Панель элемента** (drawer справа): все поля плюс история изменений из `events`.
3. Светлая и темная тема, горячие клавиши.

После MVP: палитра команд `Ctrl+K`, таймлайн, аналитика, канбан.

## Вкладка «Аналитика» (этап 5)

Встроенная, на живых данных:
- статусы по проектам (stacked bar);
- просрочки и ближайшие дедлайны;
- закрыто задач по неделям (throughput);
- cycle time: дней от `in_progress` до `done`;
- план/факт по этапам: дедлайн против фактического закрытия;
- активность сессий Claude по проектам (из `sessions`).

**Tableau Public** — отдельно, для портфолио: `orbit export` → CSV → дашборд. Живого подключения
к локальной SQLite у Tableau Public нет, поэтому встроенная вкладка для работы, Tableau для показа.

## CLI

```
orbit status                      # in progress, overdue, upcoming deadlines
orbit tree [project]              # tree in the terminal
orbit project add <slug> --name "..." --due 2026-12-20 --obsidian "Inbox/<slug>/0. <slug> — Обзор.md"
orbit milestone add <project> "Core and CLI" --due 2026-11-28
orbit task add <project> "DB schema" --milestone 1
orbit set task 12 --status done --comment "schema + migrations"
orbit log --since 7d              # change history
orbit export --csv out/           # for Tableau (stage 5)
orbit backup
orbit seed --demo                 # fictional data into data/demo.db
orbit serve                       # API + UI on http://127.0.0.1:8420, this computer only
```
У каждой команды есть `--json`: Claude читает машинный вывод, а не парсит таблицы.

## Архитектура

```
 Владелец (браузер)                 Claude (терминал)
   React UI  <-- SSE: "data changed"     orbit CLI (Typer)
       |  REST (FastAPI)                     |
       +------------> domain layer <---------+
                           |
                 SQLite: data/orbit.db  --> export CSV --> Tableau Public
```

- Одна доменная логика для API и CLI: правила статусов и запись в `events` в одном месте.
- **Живое обновление:** сервер дважды в секунду проверяет `PRAGMA data_version`; если базу изменил
  любой процесс (CLI, скрипт), шлет событие по SSE, и интерфейс перечитывает данные.
- База: путь из `ORBIT_DB`, по умолчанию `data/orbit.db` (в `.gitignore`).
  Для скриншотов и демо — `orbit seed --demo` с вымышленными проектами.

## Этапы

| #   | Этап                                                                                 | Готово, когда                                       |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 0   | Спека и каркас: PRD, ADR, CLAUDE.md, git                                             | готово 24.11                                        |
| 1   | Ядро: схема и миграции, доменная логика, `events`, CLI, тесты, demo-seed             | готово 24.11                                        |
| 2   | API и интерфейс: дерево, панель, правка в ячейке, SSE                                | готово 24.11 (статус из CLI виден в UI за 2 с)      |
| 3   | Связка: ссылки Obsidian, `/wrap-up` вызывает orbit, импорт журналов сессий, `Ctrl+K` | затем разбор прошлых сессий в orbit + Obsidian      |
| 4   | Таймлайн этапов (Гант)                                                               |                                                     |
| 5   | Аналитика, `export`, дашборд Tableau Public                                          |                                                     |
| 6   | Релиз: README ru/en, скриншоты, CI, публичный репозиторий (после «да»)               |                                                     |
| 7   | MCP-сервер                                                                           | orbit доступен как инструменты в любой сессии       |

## После первой версии

## Открытые вопросы

- Какие 3 графика нужны каждый день? Решаем на этапе 5.
- ~~Отдельный статус проекта «на паузе» или хватит `blocked`?~~ Решено: статус `paused` для всех уровней (ADR 0002). 

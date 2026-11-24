# Orbit

Локальный трекер проектов: Project → Milestone → Task, статусы, сроки, короткие комментарии;
полный текст в Obsidian. Pet-проект для портфолио на GitHub (пока приватный).

- Требования и этапы: `docs/PRD.md` (таблица «Этапы» — текущий статус проекта).
- Решения: `docs/adr/` (стек — `0001-stack.md`).

## Структура

- `backend/src/orbit/`: `domain/` (правила, сервис `Orbit`, `events`), `db/` (модели, миграции Alembic),
  `cli/` (Typer), `serialize.py`; тесты `backend/tests/`. Позже `api/` (этап 2).
- `bin/`: запускатели `orbit` (Git Bash) и `orbit.cmd` (PowerShell).
- `frontend/`: React-приложение (этап 2).
- `data/`: живая база `orbit.db`, бэкапы, `demo.db` — только локально, в git не попадает.
- `docs/`: PRD, ADR, скриншоты.

## Команды

Разработка (из `backend/`):

```
uv sync                                  # environment
uv run pytest                            # tests
uv run ruff check . ; uv run ruff format .
uv run mypy                              # strict type check
uv run alembic revision --autogenerate -m "..."   # new migration (then review it!)
```

CLI. Запуск: `bin/orbit ...` (Git Bash) или `bin\orbit.cmd ...` (PowerShell); если `bin` в PATH —
просто `orbit`. Сгенерированный `orbit.exe` блокирует Smart App Control, поэтому запускатели вызывают
`uv run python -m orbit`. У каждой команды есть `--json`; ошибки: код 1 (ввод), 3 (не найдено),
4 (нужен `--force`).

```
orbit status [--days 7]                      # in progress, blocked, overdue, upcoming
orbit tree [project] [--all]                 # tree with progress; --all = with archived
orbit project add <slug> --name "..." [--status --priority --start --due --summary --obsidian --repo --github]
orbit project list [--all] | show <slug> | archive <slug> | unarchive <slug>
orbit milestone add <project> "<name>" [--status --start --due --summary]
orbit milestone list <project> | show <id> | rm <id> [--force]
orbit task add <project> "<title>" [--milestone <id> --parent <id> --status --priority --start --due --comment]
orbit task list [project] [--milestone <id>] [--status s]... [--open] | show <id> | rm <id> [--force]
orbit set project|milestone|task <slug|id> [--name --title --slug --status --priority --start --due
          --summary --comment --obsidian --repo --github --milestone --parent --position] [--force]
                                             # 'none' clears a field: --due none
orbit log [--since 7d|12h|2w|YYYY-MM-DD] [--entity task --id 12] [--limit 50]
orbit backup [--dir path]                    # default data/backups/
orbit db info | db upgrade                   # path, revision, counts; migrations run automatically
orbit --db path/to.db ...                    # other database (or ORBIT_DB)
```

Окружение: `ORBIT_DB` — файл базы (по умолчанию `data/orbit.db`), `ORBIT_ACTOR` — кто меняет
(`vladimir` по умолчанию, `claude` в сессиях Claude, `system`). SQLAlchemy собирается без C-расширений
(`no-binary-package` в `pyproject.toml`): Smart App Control блокирует его `.pyd`.

## Правила

- Один этап — одна сессия. В начале прочитай строку этапа в `docs/PRD.md`, в конце обнови ее статус.
- Доменная логика (статусы, прогресс, `events`) — сначала тест, потом код.
- Любое изменение схемы — миграция Alembic плюс тест.
- Реальная база никогда не попадает в git, скриншоты и демо — только на `orbit seed --demo`.
- Перед добавлением зависимости проверь, что она жива, и возьми актуальную версию (`uv add`, `npm view`).
- Существенное решение (библиотека, формат данных, архитектура) — новый ADR в `docs/adr/`.
- Коммиты: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), на английском.
- Дизайн: токены цветов и отступов в одном месте; компоненты shadcn в `frontend/src/components/ui/` правим свободно.
- Dogfooding: как только заработает CLI, этапы самого orbit ведутся в orbit.
- В конце значимой работы предложи `/wrap-up` (заметки в `Inbox/orbit/`); журнал сессий пишется автоматически.
- `git push` и публичный репозиторий — только после «да» владельца.

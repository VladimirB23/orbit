# Orbit

Локальный трекер проектов: Project → Milestone → Task, статусы, сроки, короткие комментарии;
полный текст в Obsidian. Pet-проект для портфолио на GitHub (пока приватный).

- Требования и этапы: `docs/PRD.md` (таблица «Этапы» — текущий статус проекта).
- Решения: `docs/adr/` (стек — `0001-stack.md`).

## Структура

- `backend/src/orbit/`: `domain/` (правила, сервис `Orbit`, `events`), `db/` (модели, миграции Alembic),
  `api/` (FastAPI `/api/v1`, SSE, защита localhost), `cli/` (Typer), `serialize.py`, `journal.py` (разбор
  журналов сессий из Obsidian), `sync.py` (импорт сам, пока работает сервер); тесты `backend/tests/`.
- `bin/`: запускатели `orbit` (Git Bash) и `orbit.cmd` (PowerShell); `check` - все проверки разом.
- `frontend/`: React: `src/lib/` (чистая логика с тестами), `src/api/` (данные), `src/features/` (экраны; `tree` и
  `timeline` - два вида одних строк, `?screen=timeline`),
  `src/components/ui/` (shadcn), `src/index.css` (все цвета и отступы), `e2e/` (Playwright, свой сервер на тест).
- `data/`: живая база `orbit.db`, настройки `orbit.toml` (`vault = '...'`), бэкапы, `demo.db` — только
  локально, в git не попадает.
- `docs/`: PRD, ADR, скриншоты.

## Команды

Разработка (из `backend/`):

```sh
uv sync                                  # environment
uv run pytest                            # tests
uv run ruff check . ; uv run ruff format .
uv run mypy                              # strict type check
uv run alembic revision --autogenerate -m "..."   # new migration (then review it!)
```

Все проверки: `sh bin/check` или `bin\check.cmd` (`--fast` без браузера). Перед коммитом обязательно.

Фронт (из `frontend/`): `npm run dev` (нужен запущенный `orbit serve`), `npm run build`, `npm test`,
`npm run e2e`, `npm run format`. После изменения API: `npm run gen:api`. Инструменты запускать через
npm-скрипты, не напрямую: `scripts/run.mjs` лечит путаницу `d:` / `D:`.

CLI. Запуск: `bin/orbit ...` (Git Bash) или `bin\orbit.cmd ...` (PowerShell); если `bin` в PATH —
просто `orbit`. Сгенерированный `orbit.exe` блокирует Smart App Control, поэтому запускатели вызывают
`uv run python -m orbit`. У каждой команды есть `--json`; ошибки: код 1 (ввод), 3 (не найдено),
4 (нужен `--force`).

```sh
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
orbit session import                         # journals of the vault -> sessions (orbit serve does it itself)
orbit session list [project] [--limit 20]    # Claude sessions, newest first
orbit serve [--port 8420] [--no-open]        # API + UI on 127.0.0.1 only; daily backup on start
orbit openapi                                # API schema (used by npm run gen:api)
orbit backup [--dir path]                    # default data/backups/
orbit seed --demo [--reset]                  # fictional data into data/demo.db (never orbit.db)
orbit db info | db upgrade                   # path, revision, counts; migrations run automatically
orbit --db path/to.db ...                    # other database (or ORBIT_DB)
```

Окружение: `ORBIT_DB` — файл базы (по умолчанию `data/orbit.db`), `ORBIT_ACTOR` — кто меняет
(`vladimir` по умолчанию, `claude` в сессиях Claude, `system`), `ORBIT_VAULT` — vault Obsidian вместо
настройки рядом с базой. SQLAlchemy собирается без C-расширений
(`no-binary-package` в `pyproject.toml`): Smart App Control блокирует его `.pyd`.

## Правила

- Один этап — одна сессия. В начале прочитай строку этапа в `docs/PRD.md`, в конце обнови ее статус.
- Доменная логика (статусы, прогресс, `events`) — сначала тест, потом код.
- Любое изменение схемы — миграция Alembic плюс тест.
- Изменил API: `npm run gen:api`, иначе упадет `test_contract.py`. Формат ответов `/api/v1` не ломать.
- Что и где рисует таймлайн, решает `frontend/src/lib/timeline.ts` (тесты рядом); факт работы (`actual`) считает домен по `events`.
- Новая ссылка наружу: путь проверяется в `frontend/src/lib/links.ts`, сетевые пути и чужие схемы не ссылки.
- Сервер слушает только `127.0.0.1`; открыть наружу можно только с токенами и новым ADR.
- Реальная база никогда не попадает в git, скриншоты и демо — только на `orbit seed --demo`.
- Перед добавлением зависимости проверь, что она жива, и возьми актуальную версию (`uv add`, `npm view`).
- Существенное решение (библиотека, формат данных, архитектура) — новый ADR в `docs/adr/`.
- Коммиты: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), на английском.
- Дизайн: токены цветов и отступов в одном месте; компоненты shadcn в `frontend/src/components/ui/` правим свободно.
- Dogfooding: как только заработает CLI, этапы самого orbit ведутся в orbit.
- В конце значимой работы предложи `/wrap-up` (заметки в `Inbox/orbit/`); журнал сессий пишется автоматически.
- `git push` и публичный репозиторий — только после «да» владельца.

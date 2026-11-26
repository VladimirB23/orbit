# Orbit

Локальный трекер проектов: Project → Milestone → Task, статусы, сроки, короткие комментарии;
полный текст в Obsidian. Pet-проект.

- Требования и этапы: `docs/PRD.md` (таблица «Этапы» — текущий статус проекта).
- Решения: `docs/adr/` (стек — `0001-stack.md`).

## Структура

- `backend/src/orbit/`: `domain/` (правила, сервис `Orbit`, `events`, `analytics.py` и `sql/` - метрики), `db/` (модели, миграции Alembic),
  `api/` (FastAPI `/api/v1`, SSE, защита localhost), `cli/` (Typer), `serialize.py`, `journal.py` (разбор
  журналов сессий из Obsidian), `gitlog.py` (коммиты), `sync.py` (импорт сам, пока работает сервер), `export.py`
  (CSV для Tableau), `seed.py` и `seed_history.py` (демо), `desktop.py`, `taskbar.py` и `local.py` (запуск без консоли); тесты `backend/tests/`.
- `bin/`: запускатели `orbit` (Git Bash) и `orbit.cmd` (PowerShell); `check` - все проверки разом; `shortcuts.ps1` -
  ярлыки (на компьютере владельца только после "да"), `orbit.ico` (рисует `frontend/scripts/icon.mjs`).
- `frontend/`: React: `src/lib/` (чистая логика с тестами), `src/api/` (данные), `src/features/` (экраны; `tree` и
  `timeline` - два вида одних строк, `?screen=timeline`; `analytics` - третий экран, `?screen=analytics`),
  `src/components/ui/` (shadcn), `src/index.css` (все цвета и отступы), `e2e/` (Playwright, свой сервер на тест).
- `data/`: живая база `orbit.db`, настройки `orbit.toml` (`vault = '...'`, `auto_dates = true`), бэкапы, `demo*.db` —
  только локально, в git не попадает. `out/` (выгрузки, макеты) тоже.
- `.github/workflows/check.yml`: CI на Windows, те же проверки, что `bin/check`; действия закреплены по коммиту.
- `README.md` и `README.ru.md` меняются вместе; снимки `docs/images/`: `node scripts/screenshots.mjs` из `frontend/`.
- `docs/`: PRD, ADR, `metrics.md` (определения и SQL), `tableau.md` (дашборд по шагам).

## Команды

Разработка (из `backend/`):

```sh
uv sync                                  # environment
uv run python -m pytest                  # tests (python -m: Smart App Control may block .exe launchers)
uv run ruff check . ; uv run ruff format .
uv run python -m mypy                    # strict type check
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
orbit undo | redo                            # last action of the same actor (12 hours)
orbit session import                         # journals of the vault -> sessions (orbit serve does it itself)
orbit session list [project] [--limit 20]    # Claude sessions, newest first
orbit session about <id> <slug|none>         # what it was about (a future project talked over elsewhere)
orbit commit import                          # commits from git of project folders (serve does it itself)
orbit stats [project] [--days 30]            # attention: sessions, commits, closed, share against priority
orbit export --csv out/tableau               # star of CSV for Tableau + DICTIONARY.md; real data is labelled
orbit serve [--port 8420] [--no-open]        # API + UI on 127.0.0.1 only; daily backup on start
orbit app [--background]                     # Windows: server without a console and its own window (ADR 0009)
orbit stop [--port 8420]                     # stops the server of this database, however it was started
orbit openapi                                # API schema (used by npm run gen:api)
orbit backup [--dir path]                    # default data/backups/
orbit seed --demo [--reset]                  # fictional data into data/demo.db (never orbit.db)
orbit seed --demo --half-year [--until D]    # long history into data/demo-half-year.db, same D = same data
orbit db info | db upgrade                   # path, revision, counts; migrations run automatically
orbit --db path/to.db ...                    # other database (or ORBIT_DB)
```

Окружение: `ORBIT_DB` — файл базы (по умолчанию `data/orbit.db`), `ORBIT_ACTOR` — кто меняет
(`owner` по умолчанию, `claude` в сессиях Claude, `system`), `ORBIT_VAULT` — vault Obsidian вместо
настройки рядом с базой. SQLAlchemy собирается без C-расширений
(`no-binary-package` в `pyproject.toml`): Smart App Control блокирует его `.pyd`.

## Правила

- Один этап — одна сессия. В начале прочитай строку этапа в `docs/PRD.md`, в конце обнови ее статус.
- Доменная логика (статусы, прогресс, `events`) — сначала тест, потом код.
- Любое изменение схемы — миграция Alembic плюс тест.
- Изменил API: `npm run gen:api`, иначе упадет `test_contract.py`. Формат ответов `/api/v1` не ломать.
- Новое поле строки: строка в `frontend/src/lib/columns.ts` и ветка в `features/tree/cells.tsx`; если по нему сортируют - ключ в `lib/sort.ts`. Один экземпляр `Orbit` = одно действие для отмены.
- Что и где рисует таймлайн, решает `frontend/src/lib/timeline.ts` (тесты рядом); факт работы (`actual`) считает домен по `events`.
- Метрика = файл в `domain/sql/` с комментарием, тест в `test_analytics.py`, определение в `docs/metrics.md`. Новая мера - строки в `activity_facts.sql`. Мало данных - график говорит, чего не хватает. Отмененное (`events.undoes`) в метрики не попадает.
- Сроки Claude ставит сам, если они есть в разговоре (с источником); даты, поставленные человеком, не трогает, закрытому срок не ставит. Остальное ставит домен (`auto_dates`, ADR 0008).
- Проект без папки - будущий (ADR 0010): завел папку - `orbit set project <slug> --repo`, история остается. Общую
  сессию про него пометь `orbit session about`.
- Публиковать (Tableau Public, скриншоты, README) можно только данные из `demo*.db`.
- Новая ссылка наружу: путь проверяется в `frontend/src/lib/links.ts`, сетевые пути и чужие схемы не ссылки.
- Сервер слушает только `127.0.0.1`; открыть наружу можно только с токенами и новым ADR.
- Реальная база никогда не попадает в git, скриншоты и демо — только на `orbit seed --demo`.
- Перед добавлением зависимости проверь, что она жива, и возьми актуальную версию (`uv add`, `npm view`).
- Существенное решение (библиотека, формат данных, архитектура) — новый ADR в `docs/adr/`.
- Коммиты: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), на английском.
- Дизайн: токены цветов и отступов в одном месте; компоненты shadcn в `frontend/src/components/ui/` правим свободно.
- Dogfooding: как только заработает CLI, этапы самого orbit ведутся в orbit.
- В конце значимой работы предложи `/wrap-up` (заметки в `Inbox/orbit/`); журнал сессий пишется автоматически.
- `git push` и публичный репозиторий — только после явного "да" владельца.

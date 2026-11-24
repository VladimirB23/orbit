# Orbit

A local-first project tracker for one person and an AI agent: projects, milestones and tasks
with statuses, dates and short comments, a live tree view, a timeline and analytics that show where
attention goes: sessions and commits against priorities.
Long-form notes stay in Obsidian, one click away. Claude reads and updates the tracker through a CLI.

**Status:** in development, stage 5 of 7 done (core, CLI, API, live web interface, VS Code and Obsidian links, Claude session log, Ctrl+K, timeline with drag and drop, undo, adjustable columns, analytics, export for Tableau). See [docs/PRD.md](docs/PRD.md) and [docs/adr/](docs/adr/).

Stack: Python (FastAPI, SQLAlchemy, Typer) · SQLite · React + TypeScript (Vite, TanStack, shadcn/ui).

## Try it with demo data

Needs [uv](https://docs.astral.sh/uv/) and Node.js.

```sh
cd frontend && npm ci && npm run build && cd ..
bin/orbit seed --demo
bin/orbit --db data/demo.db serve        # opens http://127.0.0.1:8420
bin/orbit --db data/demo.db task list    # the CLI works on the same data, changes appear live
```

Optional: a file `data/orbit.toml`. `vault = 'path/to/your/Obsidian vault'` turns on links to notes and the import
of Claude session journals, `auto_dates = true` gives planned things a deadline by themselves.

## Analytics

Every number is one commented SQL file in [backend/src/orbit/domain/sql](backend/src/orbit/domain/sql): CTEs,
window functions, a recursive calendar. Definitions: [docs/metrics.md](docs/metrics.md) (in Russian). When there is
too little data a chart says what is missing instead of drawing a pattern out of noise.

```sh
bin/orbit seed --demo --half-year                                  # half a year of fictional history
bin/orbit --db data/demo-half-year.db serve                        # the Analytics screen (A)
bin/orbit --db data/demo-half-year.db export --csv out/tableau     # a star schema for Tableau
```

`sh bin/check` runs every check: lint, types, unit tests and end-to-end scenarios in Edge.

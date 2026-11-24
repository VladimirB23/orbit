# Orbit

A local-first project tracker for one person and an AI agent: projects, milestones and tasks
with statuses, dates and short comments, a live tree view, a timeline and built-in analytics.
Long-form notes stay in Obsidian, one click away. Claude reads and updates the tracker through a CLI.

**Status:** in development, stage 2 of 7 done (core, CLI, API, live web interface). See [docs/PRD.md](docs/PRD.md) and [docs/adr/](docs/adr/).

Stack: Python (FastAPI, SQLAlchemy, Typer) · SQLite · React + TypeScript (Vite, TanStack, shadcn/ui).

## Try it with demo data

Needs [uv](https://docs.astral.sh/uv/) and Node.js.

```sh
cd frontend && npm ci && npm run build && cd ..
bin/orbit seed --demo
bin/orbit --db data/demo.db serve        # opens http://127.0.0.1:8420
bin/orbit --db data/demo.db task list    # the CLI works on the same data, changes appear live
```

`sh bin/check` runs every check: lint, types, unit tests and end-to-end scenarios in Edge.

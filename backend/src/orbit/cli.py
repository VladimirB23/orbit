"""Command-line interface (Typer)."""

import typer

from orbit import __version__

app = typer.Typer(help="Orbit: local project tracker.", no_args_is_help=True)


@app.callback()
def root() -> None:
    """Orbit: projects, milestones and tasks with statuses and deadlines."""


@app.command()
def version() -> None:
    """Print the orbit version."""
    typer.echo(__version__)


def main() -> None:
    app()

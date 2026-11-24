@echo off
rem orbit launcher: Smart App Control blocks the generated orbit.exe, so run the module.
uv run --quiet --project "%~dp0..\backend" python -m orbit %*

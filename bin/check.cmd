@echo off
rem Every check of the project in one command; stops at the first failure. --fast skips the browser.
cd /d "%~dp0..\backend" || exit /b 1
call uv run --quiet ruff check . || exit /b 1
call uv run --quiet ruff format --check . || exit /b 1
call uv run --quiet python -m mypy || exit /b 1
call uv run --quiet python -m pytest || exit /b 1
cd /d "%~dp0..\frontend" || exit /b 1
call npm run --silent check || exit /b 1
if not "%1"=="--fast" call npm run --silent e2e || exit /b 1
echo All checks passed.

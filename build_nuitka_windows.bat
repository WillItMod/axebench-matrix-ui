@echo off
REM Build AxeBench backend with Nuitka (Windows, console shown)
REM Prerequisites: Python 3.11+, npm (for frontend build), venv tools

setlocal
set OUTPUT_NAME=AxeBench_v3.0.0_BETA
set OUTPUT_DIR=build-win-console-new
cd /d "%~dp0"

REM Build frontend (served from dist/public)
call npm run build || goto :error

REM Fresh build venv
if exist .venv-build rd /s /q .venv-build
python -m venv .venv-build || goto :error
call .venv-win\Scripts\activate.bat

pip install -r python\requirements.txt || goto :error
pip install nuitka || goto :error

python -m nuitka ^
  --onefile ^
  --windows-console-mode=force ^
  --follow-imports ^
  --output-filename=%OUTPUT_NAME% ^
  --include-data-dir=dist\public=dist\public ^
  --include-data-dir=python\templates=python\templates ^
  --include-data-file=python\config.py=python\config.py ^
  --output-dir=%OUTPUT_DIR% ^
  python\launcher.py || goto :error

echo.
echo Build complete: %OUTPUT_DIR%\%OUTPUT_NAME%.exe
exit /b 0

:error
echo Build failed. See messages above.
exit /b 1

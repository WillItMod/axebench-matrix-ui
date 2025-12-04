@echo off
REM Build AxeBench backend with Nuitka (Windows, no console window)
REM Prerequisites: Python 3.11+, npm (for frontend build), venv tools

setlocal
set OUTPUT_NAME=AxeBench_v3.0.0_BETA
cd /d "%~dp0"

REM Build frontend (served from dist/public)
npm run build || goto :error

REM Fresh build venv
if exist .venv-build rd /s /q .venv-build
python -m venv .venv-build || goto :error
call .venv-build\Scripts\activate.bat

pip install -r python\requirements.txt || goto :error
pip install nuitka || goto :error

python -m nuitka ^
  --onefile ^
  --windows-disable-console ^
  --follow-imports ^
  --output-filename=%OUTPUT_NAME% ^
  --include-data-dir=dist\public=dist\public ^
  --include-data-dir=python\templates=python\templates ^
  --include-data-dir=python\static=python\static ^
  --include-data-file=python\config.py=python\config.py ^
  --output-dir=build-win ^
  python\launcher.py || goto :error

echo.
echo Build complete: build-win\%OUTPUT_NAME%.exe
exit /b 0

:error
echo Build failed. See messages above.
exit /b 1

@echo off
title Anime Assistant (server)
cd /d "%~dp0"
if not exist .venv (
  echo Creating Python environment, first run only...
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installing/updating packages...
pip install -q -r requirements.txt
if not exist .env (
  copy .env.example .env >nul
  echo Created .env - open it in VS Code and paste your API keys, then run start.bat again.
)
python backend\main.py
pause

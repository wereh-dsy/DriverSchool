@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-game.ps1" %*
set "game_exit_code=%errorlevel%"

if not "%game_exit_code%"=="0" (
  echo.
  echo DriverGame could not start. See the message above.
  pause
)

exit /b %game_exit_code%

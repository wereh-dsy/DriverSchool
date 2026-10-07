@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-editor.ps1" %*
set "editor_exit_code=%errorlevel%"
if not "%editor_exit_code%"=="0" (
  echo DriverGame Editor could not start. See the message above.
  pause
)
exit /b %editor_exit_code%

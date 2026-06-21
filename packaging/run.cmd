@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CONFIG_FILE=%SCRIPT_DIR%config.env"

if not exist "%CONFIG_FILE%" set "CONFIG_FILE=%SCRIPT_DIR%config.example.env"

for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG_FILE%") do (
  if not "%%A"=="" set "%%A=%%B"
)

"%SCRIPT_DIR%ocs-llm-solver.exe" %*

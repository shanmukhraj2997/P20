@echo off
echo =======================================================
echo   Stopping P20 Platform Services
echo =======================================================
echo.

echo Stopping PostgreSQL (Port 5433)...
"D:\Postgresql\bin\pg_ctl.exe" -D "%~dp0.pgdata" stop

echo.
echo Closing server windows...
taskkill /FI "WINDOWTITLE eq P20 Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq P20 Frontend*" /T /F >nul 2>&1

echo.
echo All services stopped cleanly.
pause

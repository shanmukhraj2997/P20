@echo off
echo =======================================================
echo   Starting P20 Campus Resource Booking Platform
echo   Lovely Professional University (LPU)
echo =======================================================
echo.

echo [1/3] Starting PostgreSQL Database (Port 5433)...
"D:\Postgresql\bin\pg_ctl.exe" -D "%~dp0.pgdata" -o "-p 5433" -l "%~dp0.pgdata\server5433.log" start
timeout /t 2 >nul

echo [2/3] Starting Django REST Backend (Port 8000)...
start "P20 Backend (Port 8000)" cmd /k "cd /d %~dp0 && call .venv\Scripts\activate && python backend\manage.py runserver 0.0.0.0:8000"
timeout /t 2 >nul

echo [3/3] Starting Next.js Frontend (Port 3000)...
start "P20 Frontend (Port 3000)" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 3 >nul

echo.
echo =======================================================
echo   All Services Started Successfully!
echo =======================================================
echo.
echo   - Frontend Portal:    http://localhost:3000/login
echo   - Django Admin Panel: http://localhost:8000/admin/
echo     Username: demo_admin
echo     Password: DemoPass123!
echo.
echo   Press any key to open the Admin Panel and Frontend...
pause >nul

start http://localhost:8000/admin/
start http://localhost:3000/login

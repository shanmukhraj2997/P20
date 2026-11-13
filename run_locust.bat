@echo off
title P20 Platform - Locust Load & Concurrency Testing
echo =======================================================
echo   P20 Campus Resource Booking Platform
echo   Locust Concurrency & Load Testing (500 Users)
echo =======================================================
echo.
echo Choose execution mode:
echo   [1] Web UI Mode   (Recommended for presentation graphs at http://localhost:8089)
echo   [2] Headless Mode (Automated 30s terminal run with 500 users)
echo.
set /p MODE="Enter choice (1 or 2, default is 1): "

if "%MODE%"=="2" (
    echo.
    echo Running Locust in Headless Mode (500 users, 50 spawn rate, 30s)...
    echo Target: http://127.0.0.1:8000
    echo.
    call .venv\Scripts\activate
    locust -f locustfile.py --headless -u 500 -r 50 --run-time 30s --host http://127.0.0.1:8000
    echo.
    echo Load test finished!
    pause
) else (
    echo.
    echo Starting Locust Web Dashboard at http://localhost:8089...
    echo Target: http://127.0.0.1:8000
    echo.
    start http://localhost:8089
    call .venv\Scripts\activate
    locust -f locustfile.py --host http://127.0.0.1:8000
)

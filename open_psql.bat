@echo off
echo =======================================================
echo   Opening PostgreSQL Interactive Shell (psql)
echo   Database: p20_campus_db  ^|  Port: 5433
echo =======================================================
echo.

set PGPASSWORD=postgres
"D:\Postgresql\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -d p20_campus_db

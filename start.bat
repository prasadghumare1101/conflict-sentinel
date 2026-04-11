@echo off
title Sentinel Platform Launcher
echo ============================================
echo  SENTINEL PLATFORM - Starting All Services
echo ============================================
echo.

:: Start Backend in a new window
echo [1/2] Starting Backend (Node.js on port 3001)...
start "Sentinel Backend" cmd /k "cd /d %~dp0backend && node server.js"

:: Short wait for backend to bind to port
timeout /t 2 /nobreak >nul

:: Start Frontend in a new window
echo [2/2] Starting Frontend (Vite on port 5173)...
start "Sentinel Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo  Services started in separate windows:
echo   Backend  -> http://localhost:3001
echo   Frontend -> http://localhost:5173
echo ============================================
echo.
echo Both windows will close if you close this one.
echo Press any key to open the dashboard in your browser...
pause >nul
start "" "http://localhost:5173"

@echo off
title AI Office 3D
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo   Chua cai Node.js. Tai tai https://nodejs.org roi mo lai.
  pause
  exit /b
)

if not exist node_modules (
  echo Dang cai thu vien lan dau...
  call npm install
)

rem Hoi server dang chay: ban moi thi chi mo trinh duyet, ban cu thi tat de bat ban moi
node restart-if-old.mjs
if errorlevel 1 (
  start "" http://localhost:3210
  timeout /t 4 >nul
  exit /b
)

echo.
echo   AI Office 3D dang khoi dong...
echo   Dong cua so nay de tat van phong.
echo.
start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:3210"
node server.js
pause

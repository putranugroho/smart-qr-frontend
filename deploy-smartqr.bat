@echo off
set APP_DIR=C:\inetpub\wwwroot\smart-qr-frontend
set BRANCH=main
set APP_NAME=smart-qr
set LOG_DIR=%APP_DIR%\deploy-logs

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%APP_DIR%"

echo =========================
echo START DEPLOY
echo =========================

git fetch origin

FOR /F %%i IN ('git rev-parse HEAD') DO SET LOCAL=%%i
FOR /F %%i IN ('git rev-parse origin/%BRANCH%') DO SET REMOTE=%%i

if "%LOCAL%"=="%REMOTE%" (
 echo No update found
 exit
)

echo Update detected

git pull origin %BRANCH%

echo Install dependency
call "C:\Program Files\nodejs\npm.cmd" install

echo Build next.js
call "C:\Program Files\nodejs\npm.cmd" run build

if %errorlevel% neq 0 (
 echo BUILD FAILED - ROLLBACK
 git reset --hard %LOCAL%
 exit
)

echo Restart PM2
pm2 reload %APP_NAME%

echo Deploy completed
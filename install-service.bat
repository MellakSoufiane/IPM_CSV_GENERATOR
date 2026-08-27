@echo off
setlocal EnableDelayedExpansion

REM ============================
REM CONFIGURATION
REM ============================
REM Assurez-vous que le chemin du projet est correct
set PROJECT_ROOT=C:\Users\Public\CBA\IPM_CSV_GENERATOR
set NODE_EXE=C:\Program Files\nodejs\node.exe
REM Changez 'index.js' si votre fichier s'appelle ainsi
set SCRIPT=%PROJECT_ROOT%\index.js
set SERVICE_NAME=IPM-Generator

set LOG_DIR=%PROJECT_ROOT%\logs

REM ============================
REM PREPARE LOGS
REM ============================
mkdir "%LOG_DIR%" 2>nul

echo ============================================
echo IPM Generator Service Installer
echo ============================================

REM ============================
REM STOP OLD SERVICE
REM ============================
echo Stopping old service...
nssm stop %SERVICE_NAME% >nul 2>&1
nssm remove %SERVICE_NAME% confirm >nul 2>&1

REM ============================
REM INSTALL SERVICE
REM ============================
echo Installing service...

nssm install %SERVICE_NAME% "%NODE_EXE%"
nssm set %SERVICE_NAME% AppParameters "%SCRIPT%"
nssm set %SERVICE_NAME% AppDirectory "%PROJECT_ROOT%"

REM Auto start
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START

REM Logs (Fichiers de sortie)
REM   out.log  -> tout ce qui passe par console.log (requetes, appels DB, taches)
REM   err.log  -> tout ce qui passe par console.error (erreurs)
nssm set %SERVICE_NAME% AppStdout "%LOG_DIR%\out.log"
nssm set %SERVICE_NAME% AppStderr "%LOG_DIR%\err.log"
nssm set %SERVICE_NAME% AppStdoutCreationDisposition 4
nssm set %SERVICE_NAME% AppStderrCreationDisposition 4

REM Rotation des logs : evite que out.log/err.log grossissent indefiniment.
REM Rotation quotidienne ET des qu'un fichier depasse 10 Mo (le premier des deux declenche).
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateOnline 1
nssm set %SERVICE_NAME% AppRotateSeconds 86400
nssm set %SERVICE_NAME% AppRotateBytes 10485760

REM Restart on crash
nssm set %SERVICE_NAME% AppRestart 1
nssm set %SERVICE_NAME% AppRestartDelay 5000

REM ============================
REM START SERVICE
REM ============================
echo Starting service...
nssm start %SERVICE_NAME%

echo ============================================
echo IPM Generator Service Installed
echo Service Name: %SERVICE_NAME%
echo Path: %PROJECT_ROOT%
echo Logs: %LOG_DIR%
echo   - %LOG_DIR%\out.log  (requetes / DB / taches)
echo   - %LOG_DIR%\err.log  (erreurs)
echo ============================================

pause

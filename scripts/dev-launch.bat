@echo off
REM A C->D atkoltoztetett cargo/rustup/temp cache-ek eleresi utjat itt allitjuk
REM be kozvetlenul, mert az Intezobol inditott folyamatok nem feltetlenul
REM latjak meg a felhasznaloi kornyezeti valtozok kesobbi frissiteset addig,
REM amig ujra be nem jelentkezel.
set "CARGO_HOME=D:\RUNMATE_CRM\0\cargo"
set "RUSTUP_HOME=D:\RUNMATE_CRM\0\rustup"
set "TEMP=D:\RUNMATE_CRM\0\temp"
set "TMP=D:\RUNMATE_CRM\0\temp"
set "PATH=D:\RUNMATE_CRM\0\cargo\bin;%PATH%"

cd /d D:\RUNMATE_CRM

echo Backend ellenorzese...
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo Backend inditasa uj ablakban...
    start "RunMate CRM Backend" cmd /k "cd /d D:\RUNMATE_CRM && npm run dev:backend"
    timeout /t 5 /nobreak >nul
) else (
    echo Backend mar fut.
)

echo RunMate CRM inditasa...
call npm run dev:frontend
pause

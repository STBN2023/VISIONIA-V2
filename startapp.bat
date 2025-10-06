@echo off
set "APP_DIR=C:\Users\Admin\dyad-apps\tiny-axolotl-dart"

cd /d "%APP_DIR%"
start "APP DEV" powershell -NoExit -Command ^
  "npm run dev | ForEach-Object { $_; if ($_ -match 'http://localhost:\d+') { Start-Process $matches[0] } }"

@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: AIPA Electron-UI Windows Build Script
:: ============================================================
:: Usage:
::   scripts\build-win.bat              Full build + package
::   scripts\build-win.bat --dev        Install deps + build (no package)
::   scripts\build-win.bat --install    Install deps only
:: ============================================================

cd /d "%~dp0\.."
echo.
echo ============================================================
echo  AIPA Electron-UI Windows Build
echo  Working dir: %CD%
echo ============================================================
echo.

:: ---- Parse arguments ----
set MODE=full
if "%~1"=="--dev" set MODE=dev
if "%~1"=="--install" set MODE=install

:: ---- Step 1: Install dependencies ----
echo [1/6] Installing dependencies...
if exist node_modules\.bin\tsc.cmd (
    echo   node_modules already populated, skipping npm install.
    echo   ^(Delete node_modules to force a fresh install.^)
) else (
    echo   Running npm install --ignore-scripts ...
    call npm install --ignore-scripts
    if !errorlevel! neq 0 (
        echo [ERROR] npm install failed.
        exit /b 1
    )
)
echo   Done.
echo.

:: ---- Step 2: Download Electron binary ----
echo [2/6] Downloading Electron binary...
if exist node_modules\electron\dist\electron.exe (
    echo   Electron binary already exists, skipping.
) else (
    echo   Running electron install script...
    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    call node node_modules\electron\install.js
    if !errorlevel! neq 0 (
        echo [ERROR] Electron binary download failed.
        echo        Try setting ELECTRON_MIRROR or checking your network.
        exit /b 1
    )
)
echo   Done.
echo.

:: ---- Step 3: Rebuild node-pty for Electron ----
echo [3/6] Rebuilding node-pty for Electron...
call npx electron-rebuild -f -w node-pty
if !errorlevel! neq 0 (
    echo [WARN] electron-rebuild failed. Terminal panel may not work.
    echo        Ensure Visual Studio C++ Build Tools are installed.
    echo        Continuing build anyway...
) else (
    echo   Done.
)
echo.

:: ---- Step 4: Patch node-pty + verify ----
echo [4/6] Patching and verifying node-pty...
call node scripts\patch-node-pty.js
if !errorlevel! neq 0 (
    echo [WARN] node-pty patch failed. Manual review may be needed.
)
call node scripts\verify-pty.js
echo   Done.
echo.

if "%MODE%"=="install" (
    echo ============================================================
    echo  Dependencies installed successfully.
    echo ============================================================
    exit /b 0
)

:: ---- Step 5: Build the app ----
echo [5/6] Building the app...
call npm run build
if !errorlevel! neq 0 (
    echo [ERROR] Build failed.
    exit /b 1
)
echo   Done.
echo.

if "%MODE%"=="dev" (
    echo ============================================================
    echo  Build complete (dev mode, no packaging).
    echo ============================================================
    exit /b 0
)

:: ---- Step 6: Package for Windows ----
echo [6/6] Packaging for Windows x64...

:: Check if build/icon.ico exists
if not exist build\icon.ico (
    echo [WARN] build\icon.ico not found. electron-builder may fail or use a default icon.
    if not exist build mkdir build
)

:: Check if ../package exists (CLI resources)
if not exist "..\package\cli.js" (
    echo [WARN] ..\package\cli.js not found. The packaged app will be missing the CLI engine.
    echo        Make sure the package/ directory exists at the repo root.
)

call npx electron-builder --win --x64
if !errorlevel! neq 0 (
    echo [ERROR] Packaging failed.
    exit /b 1
)
echo   Done.
echo.

echo ============================================================
echo  Build complete! Output in: release\
echo ============================================================
exit /b 0

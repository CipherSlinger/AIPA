@echo off
setlocal enabledelayedexpansion

:: update-cli.bat — Check and update @anthropic-ai/claude-code in package\

set "SCRIPT_DIR=%~dp0"
set "PACKAGE_JSON=%SCRIPT_DIR%package\package.json"

:: --- Read current version ---
if not exist "%PACKAGE_JSON%" (
    echo Error: %PACKAGE_JSON% not found.
    exit /b 1
)

for /f "delims=" %%v in ('node -e "console.log(require('%PACKAGE_JSON:\=\\%').version)" 2^>nul') do set "CURRENT=%%v"
if "%CURRENT%"=="" (
    echo Error: Could not read version from %PACKAGE_JSON%
    exit /b 1
)

echo Current version : %CURRENT%
set /p "=Checking latest version on npm..." <nul

for /f "delims=" %%v in ('npm show @anthropic-ai/claude-code version 2^>nul') do set "LATEST=%%v"
if "%LATEST%"=="" (
    echo.
    echo Error: Could not reach npm registry.
    exit /b 1
)

echo  %LATEST%

:: --- Compare ---
if "%CURRENT%"=="%LATEST%" (
    echo Already up to date.
    exit /b 0
)

echo.
echo New version available: %CURRENT% -^> %LATEST%
set /p "ANSWER=Update package\ to v%LATEST%? [y/N] "

if /i "%ANSWER%"=="y" goto DO_UPDATE
if /i "%ANSWER%"=="yes" goto DO_UPDATE
echo Skipped.
exit /b 0

:DO_UPDATE
set "TARBALL=anthropic-ai-claude-code-%LATEST%.tgz"
set "PACKAGE_DIR=%SCRIPT_DIR%package"
set "TMP_DIR=%SCRIPT_DIR%_tmp_update"

echo Downloading v%LATEST%...
call npm pack "@anthropic-ai/claude-code@%LATEST%" --quiet
if errorlevel 1 (
    echo Error: npm pack failed.
    exit /b 1
)

echo Extracting into package\...
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
mkdir "%TMP_DIR%"

tar -xzf "%TARBALL%" -C "%TMP_DIR%"
if errorlevel 1 (
    echo Error: Extraction failed.
    rmdir /s /q "%TMP_DIR%"
    del /q "%TARBALL%" 2>nul
    exit /b 1
)

:: Replace package\ contents
if exist "%PACKAGE_DIR%" rmdir /s /q "%PACKAGE_DIR%"
move "%TMP_DIR%\package" "%PACKAGE_DIR%" >nul
rmdir /s /q "%TMP_DIR%"
del /q "%TARBALL%"

for /f "delims=" %%v in ('node -e "console.log(require('%PACKAGE_JSON:\=\\%').version)" 2^>nul') do set "NEW_VER=%%v"
echo.
echo Updated: %CURRENT% -^> %NEW_VER%

endlocal

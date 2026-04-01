@echo off
echo === Applying Buddy Patch ===
echo.
echo Copying patched version 2.1.89 over claude.exe...
copy /Y "%USERPROFILE%\.local\share\claude\versions\2.1.89" "%USERPROFILE%\.local\bin\claude.exe"
echo.
echo Done. Verifying...
node "%~dp0buddy-crack.js" status
pause

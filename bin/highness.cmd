@ECHO OFF
SETLOCAL
node "%~dp0..\dist\cli.js" %*
EXIT /b %ERRORLEVEL%

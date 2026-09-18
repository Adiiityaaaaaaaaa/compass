@echo off
set "COMPASS_NODE_DIR=%~dp0.tools\node"
set "PATH=%COMPASS_NODE_DIR%;%PATH%"
echo Added %COMPASS_NODE_DIR% to PATH for this session.
node --version
npm --version

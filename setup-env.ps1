$CompassNodeDir = Join-Path $PSScriptRoot ".tools\node"
$env:PATH = "$CompassNodeDir;$env:PATH"
Write-Host "Added $CompassNodeDir to PATH for this session."
node --version
npm --version

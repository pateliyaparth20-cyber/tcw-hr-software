$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$envPath = Join-Path $projectRoot '.env'

function Set-EnvValue([string]$Name,[string]$Value){
  $content = if (Test-Path $envPath) { Get-Content $envPath -Raw } else { '' }
  $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
  $line = "$Name=$Value"
  if($content -match $pattern){
    $content = [regex]::Replace($content,$pattern,$line)
  } else {
    if($content.Length -gt 0 -and -not $content.EndsWith("`n")){ $content += "`r`n" }
    $content += "$line`r`n"
  }
  Set-Content $envPath $content -NoNewline -Encoding UTF8
}

if (-not (Test-Path $envPath)) {
  Write-Host 'Creating local .env...' -ForegroundColor Cyan
  & npm.cmd run setup
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
  Write-Host ''
  Write-Host 'ADB is not installed.' -ForegroundColor Red
  Write-Host 'Install Android Platform Tools, open a NEW PowerShell window, then run:' -ForegroundColor Yellow
  Write-Host '  npm run phone:usb' -ForegroundColor White
  Write-Host ''
  exit 2
}

& adb start-server | Out-Null
$deviceLines = & adb devices
$authorized = @($deviceLines | Select-Object -Skip 1 | Where-Object { $_ -match "\tdevice$" })
$unauthorized = @($deviceLines | Select-Object -Skip 1 | Where-Object { $_ -match "\tunauthorized$" })

if ($unauthorized.Count -gt 0) {
  Write-Host ''
  Write-Host 'Phone detected but USB debugging is not authorized.' -ForegroundColor Yellow
  Write-Host 'Unlock the phone and tap ALLOW on the USB debugging prompt, then run npm run phone:usb again.'
  exit 3
}
if ($authorized.Count -eq 0) {
  Write-Host ''
  Write-Host 'No authorized Android phone detected.' -ForegroundColor Red
  Write-Host 'Connect phone by USB, enable Developer options > USB debugging, then run npm run phone:usb again.' -ForegroundColor Yellow
  exit 4
}

Set-EnvValue 'API_BIND_HOST' '0.0.0.0'
Set-EnvValue 'APP_ORIGINS' 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001'
Set-EnvValue 'COOKIE_SECURE' 'false'

foreach($port in 3000,3001,4000){
  & adb reverse "tcp:$port" "tcp:$port" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not create ADB reverse tunnel for port $port." }
}

Write-Host ''
Write-Host 'TCW HR Android local USB access is ready.' -ForegroundColor Green
Write-Host 'Keep the USB cable connected and USB debugging enabled.' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Open these IP URLs on the PHONE:' -ForegroundColor Yellow
Write-Host '  HR:          http://127.0.0.1:3000/login'
Write-Host '  Super Admin: http://127.0.0.1:3001/login'
Write-Host ''
Write-Host 'Starting TCW HR local test stack...' -ForegroundColor Cyan
Write-Host ''
& npm.cmd run local:test
exit $LASTEXITCODE

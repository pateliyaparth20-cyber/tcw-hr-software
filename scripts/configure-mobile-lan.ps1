$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path $envPath)) {
  Write-Host '.env not found. Creating local configuration first...' -ForegroundColor Yellow
  Push-Location $projectRoot
  try { node scripts/setup.mjs } finally { Pop-Location }
  if (-not (Test-Path $envPath)) { throw '.env could not be created automatically.' }
}
$config = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
if (-not $config) { throw 'Could not detect active LAN/Wi-Fi IPv4 address. Run ipconfig and configure APP_ORIGINS manually.' }
$ip = $config.IPv4Address.IPAddress
function Set-EnvValue([string]$Name,[string]$Value){
  $content=Get-Content $envPath -Raw
  $pattern="(?m)^$([regex]::Escape($Name))=.*$";$line="$Name=$Value"
  if($content -match $pattern){$content=[regex]::Replace($content,$pattern,$line)}else{if($content.Length -gt 0 -and -not $content.EndsWith("`n")){$content+="`r`n"};$content+="$line`r`n"}
  Set-Content $envPath $content -NoNewline -Encoding UTF8
}
Set-EnvValue 'API_BIND_HOST' '0.0.0.0'
Set-EnvValue 'API_INTERNAL_URL' 'http://127.0.0.1:4000'
Set-EnvValue 'COOKIE_SECURE' 'false'
Set-EnvValue 'LOCAL_TEST_MODE' 'true'
Set-EnvValue 'APP_ORIGINS' "http://localhost:3000,http://localhost:3001,http://${ip}:3000,http://${ip}:3001"
Set-EnvValue 'BIOMETRIC_PUBLIC_URL' "http://${ip}:4000"
Write-Host ''
Write-Host 'TCW HR Software LAN/mobile access configured.' -ForegroundColor Green
Write-Host "HR Mobile URL:    http://${ip}:3000"
Write-Host "Super Admin URL:  http://${ip}:3001"
Write-Host "BioMax API:       http://${ip}:4000"
Write-Host ''
Write-Host 'Restart with: npm run demo'
Write-Host 'Phone and PC must be on the same Wi-Fi/LAN.' -ForegroundColor Cyan
Write-Host 'For PWA install on a real phone, deploy the portal on HTTPS. Normal browser use works on LAN HTTP.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'If Windows Firewall blocks access, run PowerShell as Administrator:' -ForegroundColor Yellow
Write-Host 'New-NetFirewallRule -DisplayName "TCW HR Web" -Direction Inbound -Protocol TCP -LocalPort 3000,3001,4000 -Action Allow'

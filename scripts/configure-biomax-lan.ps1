$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path $envPath)) {
    throw ".env was not found. Run npm run setup once, then run this script again."
}

$config = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
    Select-Object -First 1

if (-not $config) {
    throw "Could not detect an active LAN/Wi-Fi IPv4 address. Run ipconfig and set BIOMETRIC_PUBLIC_URL manually."
}

$ip = $config.IPv4Address.IPAddress
if (-not $ip) {
    throw "Could not detect an IPv4 address."
}

function Set-EnvValue([string]$Name, [string]$Value) {
    $content = Get-Content $envPath -Raw
    $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
    $line = "$Name=$Value"
    if ($content -match $pattern) {
        $content = [regex]::Replace($content, $pattern, $line)
    } else {
        if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) { $content += "`r`n" }
        $content += "$line`r`n"
    }
    Set-Content $envPath $content -NoNewline -Encoding UTF8
}

Set-EnvValue 'API_BIND_HOST' '0.0.0.0'
Set-EnvValue 'APP_ORIGINS' "http://localhost:3000,http://localhost:3001,http://${ip}:3000,http://${ip}:3001"
Set-EnvValue 'BIOMETRIC_PUBLIC_URL' "http://${ip}:4000"
Set-EnvValue 'BIOMAX_AUTO_MAP_EMPLOYEE_CODE' 'true'
Set-EnvValue 'BIOMAX_ENFORCE_SOURCE_IP' 'false'

Write-Host ''
Write-Host 'BioMax LAN settings saved to .env.' -ForegroundColor Green
Write-Host "Server Address: $ip"
Write-Host 'Server Port:    4000'
Write-Host 'Protocol:       PUSH Protocol'
Write-Host 'Device Type:    T&A PUSH'
Write-Host ''
Write-Host 'Restart the software with: npm run demo'
Write-Host ''
Write-Host 'If the BioMax terminal cannot connect, open PowerShell as Administrator and run:' -ForegroundColor Yellow
Write-Host 'New-NetFirewallRule -DisplayName "TCW BioMax API" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow'

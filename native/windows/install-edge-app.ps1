param([string]$Url='http://localhost:3000')
$edgeCandidates=@("$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe","$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
$edge=$edgeCandidates|Where-Object{Test-Path $_}|Select-Object -First 1
if(-not $edge){Write-Error 'Microsoft Edge was not found.';exit 1}
$desktop=[Environment]::GetFolderPath('Desktop')
$shortcut=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'TCW HR Software.lnk'))
$shortcut.TargetPath=$edge
$shortcut.Arguments="--app=$Url"
$shortcut.WorkingDirectory=Split-Path $edge
$shortcut.IconLocation="$edge,0"
$shortcut.Save()
Write-Host "TCW HR Software shortcut created on Desktop for $Url"

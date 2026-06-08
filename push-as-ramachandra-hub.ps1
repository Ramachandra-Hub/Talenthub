# Push Talenthub to GitHub as Ramachandra-Hub (Option 1)
# Run this in PowerShell: right-click -> Run with PowerShell, or:
#   cd c:\Users\user\Desktop\Talenthub-git-push
#   .\push-as-ramachandra-hub.ps1

$ErrorActionPreference = "Stop"
$gitRoot = "c:\Users\user\Desktop\Talenthub-main\.tools\MinGit"
$git = "$gitRoot\cmd\git.exe"
$gcm = "$gitRoot\mingw64\bin\git-credential-manager.exe"
$repo = "c:\Users\user\Desktop\Talenthub-git-push"
$env:PATH = "$gitRoot\cmd;$gitRoot\mingw64\bin;" + $env:PATH

if (-not (Test-Path $git)) {
  Write-Host "Git not found at $git" -ForegroundColor Red
  exit 1
}

Set-Location $repo

# Force GitHub username to Ramachandra-Hub
& $git remote set-url origin "https://Ramachandra-Hub@github.com/Ramachandra-Hub/Talenthub.git"

# Drop cached github.com credentials (wrong account: jagadishvajjha94-pixel)
if (Test-Path $gcm) {
  "protocol=https`nhost=github.com`n" | & $gcm erase 2>$null
}
"protocol=https`nhost=github.com`n" | & $git credential reject 2>$null
cmdkey /delete:git:https://github.com 2>$null
cmdkey /delete:"LegacyGeneric:target=git:https://github.com" 2>$null

Write-Host ""
Write-Host "=== Push to Ramachandra-Hub/Talenthub ===" -ForegroundColor Cyan
Write-Host "When prompted:" -ForegroundColor Yellow
Write-Host "  Username: Ramachandra-Hub"
Write-Host "  Password: your GitHub Personal Access Token (NOT your GitHub password)"
Write-Host ""
Write-Host "Create token: GitHub -> Settings -> Developer settings -> Personal access tokens -> repo scope"
Write-Host ""

& $git status -sb
& $git log -1 --oneline
Write-Host ""
& $git push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host "`nPush succeeded. Check: https://github.com/Ramachandra-Hub/Talenthub" -ForegroundColor Green
} else {
  Write-Host "`nPush failed. Windows is still using jagadishvajjha94-pixel." -ForegroundColor Red
  Write-Host ""
  Write-Host "Manual fix:" -ForegroundColor Yellow
  Write-Host "  1. Win+S -> Credential Manager -> Windows Credentials"
  Write-Host "  2. Remove ALL entries containing github.com or git:https://github.com"
  Write-Host "  3. Re-run this script and sign in as Ramachandra-Hub with a PAT"
  Write-Host ""
  Write-Host "Or one-shot push with token (replace YOUR_TOKEN):" -ForegroundColor Yellow
  Write-Host '  git push https://Ramachandra-Hub:YOUR_TOKEN@github.com/Ramachandra-Hub/Talenthub.git main'
}

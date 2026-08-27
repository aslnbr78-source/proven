# Full ProvenMath deploy — hosting, Firestore (rules + indexes), Storage rules, all Cloud Functions.
# Usage (from repo root):
#   npm run deploy
#   .\scripts\deploy-all.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host "ProvenMath full deploy -> provenmath-lms-e4e6b" -ForegroundColor Cyan
Write-Host ""

Write-Host "[0/3] Syncing Hub lesson JSON into public/lessons for all courses (best effort)..." -ForegroundColor Yellow
try {
  node scripts/export-lessons-from-firestore-admin.cjs algebra-1 algebra-2 precalculus bus-math statistics 2>&1 | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
} catch {
  Write-Host "Firestore lesson export skipped (credentials or offline)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "[1/3] Building production bundle..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

# Firebase hosting fails (EISDIR) if dist contains empty directories — remove them.
Get-ChildItem dist -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
  if (-not (Get-ChildItem $_.FullName -Force | Select-Object -First 1)) {
    Write-Host "Removing empty dist folder: $($_.FullName)" -ForegroundColor DarkGray
    Remove-Item $_.FullName -Force
  }
}

Write-Host ""
Write-Host "[2/3] Deploying hosting, firestore, storage, functions..." -ForegroundColor Yellow
firebase deploy --only hosting,firestore,storage,functions
if ($LASTEXITCODE -ne 0) {
  Write-Host "Firebase deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Deploy complete." -ForegroundColor Green
Write-Host "Hosting: https://provenmath-lms-e4e6b.web.app" -ForegroundColor Green
Write-Host "Hard refresh or clear PWA cache after deploy." -ForegroundColor Gray

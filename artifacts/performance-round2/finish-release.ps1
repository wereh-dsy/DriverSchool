$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath 'D:\dsy\drivergame'
$output = 'artifacts/performance-round2'
$resultFile = "$output/release.exit.txt"
'waiting for build' | Set-Content -LiteralPath $resultFile

function Invoke-Stage {
  param([string]$Log, [string]$Program, [string[]]$Arguments)
  & $Program @Arguments 2>&1 | ForEach-Object { $_.ToString() | Out-File -LiteralPath "$output/$Log" -Append -Encoding utf8 }
  if ($LASTEXITCODE -ne 0) { throw "$Log failed with exit $LASTEXITCODE" }
}

try {
  $buildPid = [int](Get-Content -LiteralPath "$output/build.pid")
  if ((Get-Content -LiteralPath "$output/build.exit.txt") -eq 'running') {
    Wait-Process -Id $buildPid -ErrorAction SilentlyContinue
  }
  if ((Get-Content -LiteralPath "$output/build.exit.txt") -ne '0' -or
      -not (Select-String -LiteralPath "$output/build.log" -SimpleMatch 'Checkpoint published' -Quiet)) {
    throw 'The normal build did not publish a validated checkpoint'
  }

  $env:DRIVERSCHOOL_RELEASE_DIR = 'D:/DriverSchoolRelease/DriverSchool-Performance-Round2-20261109-final'
  if (Test-Path -LiteralPath $env:DRIVERSCHOOL_RELEASE_DIR) { throw 'The dedicated release path must be new' }
  # Check actual filesystem targets before invoking the package script's cleanup.
  Invoke-Stage 'package-path-check.log' 'node' @("$output/check-package-path.mjs")
  'desktop build' | Set-Content -LiteralPath $resultFile
  Invoke-Stage 'desktop-build.log' 'pnpm' @('run', 'desktop:build')
  'package' | Set-Content -LiteralPath $resultFile
  Invoke-Stage 'package.log' 'node' @('scripts/desktop-package.mjs')
  'package verification' | Set-Content -LiteralPath $resultFile
  Invoke-Stage 'package-content-check.log' 'node' @("$output/check-package.mjs")
  'EXE smoke' | Set-Content -LiteralPath $resultFile
  Invoke-Stage 'release-smoke.log' 'node' @("$output/smoke-release.mjs")
  Invoke-Stage 'preservation.log' 'node' @("$output/check-preservation.mjs")
  '0' | Set-Content -LiteralPath $resultFile
} catch {
  $_.ToString() | Set-Content -LiteralPath "$output/release-error.log"
  '1' | Set-Content -LiteralPath $resultFile
  exit 1
}

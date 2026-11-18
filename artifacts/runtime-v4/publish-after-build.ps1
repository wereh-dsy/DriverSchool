$ErrorActionPreference='Stop'
Set-Location -LiteralPath D:/dsy/drivergame
'Running' | Set-Content artifacts/runtime-v4/publish.exit.txt
try {
  while ((Get-Content artifacts/runtime-v4/build.exit.txt -Raw).Trim() -eq 'Running') {
    if (-not (Get-Process -Id ([int](Get-Content artifacts/runtime-v4/build.pid.txt)) -ErrorAction SilentlyContinue)) { throw 'Build process ended without completion receipt' }
    Start-Sleep -Seconds 3
  }
  if ((Get-Content artifacts/runtime-v4/build.exit.txt -Raw).Trim() -ne '0') { throw 'Normal build did not pass' }
  & node artifacts/runtime-v4/verify-build.mjs *> artifacts/runtime-v4/verify-build.log
  if ($LASTEXITCODE -ne 0) { throw 'Build verification failed' }
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File artifacts/runtime-v4/release.ps1 *> artifacts/runtime-v4/release-pipeline.log
  if ($LASTEXITCODE -ne 0) { throw 'Desktop package failed' }
  $env:DRIVERSCHOOL_RELEASE_DIR='D:/DriverSchoolRelease/DriverSchool-RuntimeV2-Phase4-20261118'
  & node artifacts/runtime-v4/release/smoke-release.mjs *> artifacts/runtime-v4/release/smoke.log
  if ($LASTEXITCODE -ne 0) { throw 'Packaged EXE check failed' }
  & node artifacts/runtime-v4/verify-worktree.mjs *> artifacts/runtime-v4/worktree-final.log
  if ($LASTEXITCODE -ne 0) { throw 'Protected worktree/release verification failed' }
  '0' | Set-Content artifacts/runtime-v4/publish.exit.txt
} catch {
  $_ | Out-File artifacts/runtime-v4/publish-error.log
  '1' | Set-Content artifacts/runtime-v4/publish.exit.txt
  exit 1
}

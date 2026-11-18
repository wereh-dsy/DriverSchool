$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'D:\dsy\drivergame'
$releaseExit=1
$step='basic-build'
$log='D:\dsy\drivergame\artifacts\road-geometry-round5\release-basic.log'
try {
  $build=Start-Process powershell.exe -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/build-checkpoint.ps1','-BasicValidation') -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError ($log+'.stderr') -Wait -PassThru
  if ($build.ExitCode -ne 0) { throw "Basic build failed: $($build.ExitCode)" }
  $step='desktop-build'
  $desktop=Start-Process powershell.exe -ArgumentList @('-NoLogo','-NoProfile','-Command','& pnpm run desktop:build; exit $LASTEXITCODE') -WindowStyle Hidden -RedirectStandardOutput ($log+'.desktop') -RedirectStandardError ($log+'.desktop.stderr') -Wait -PassThru
  if ($desktop.ExitCode -ne 0) { throw "Desktop build failed: $($desktop.ExitCode)" }
  $step='publish-package'
  $package=Start-Process node -ArgumentList @('scripts/desktop-package.mjs') -WindowStyle Hidden -RedirectStandardOutput ($log+'.package') -RedirectStandardError ($log+'.package.stderr') -Wait -PassThru
  if ($package.ExitCode -ne 0) { throw "Desktop package failed: $($package.ExitCode)" }
  $step='complete'
  $releaseExit=0
} catch {
  [IO.File]::AppendAllText($log,($_|Out-String))
} finally {
  [IO.File]::WriteAllText('D:\dsy\drivergame\artifacts\road-geometry-round5\release-result.json',(@{exitCode=$releaseExit;step=$step;validation='BasicValidation';userAuthorizedReducedValidation=$true;knownFullCoreFailure='Circuit hairpin tank-500-hi4-t: max lateral error 5.472599481557198 m, limit 4.383 m';target='D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe';completedAt=(Get-Date).ToString('o')}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
exit $releaseExit

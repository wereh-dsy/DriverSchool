$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'D:\dsy\drivergame'
$packageExit=1
try {
  & pnpm run desktop:package *> artifacts/road-geometry-round5/release-package-final.log
  $packageExit=$LASTEXITCODE
} catch {
  [System.IO.File]::AppendAllText('D:\dsy\drivergame\artifacts\road-geometry-round5\release-package-final.log',($_|Out-String))
} finally {
  [System.IO.File]::WriteAllText('D:\dsy\drivergame\artifacts\road-geometry-round5\release-result.json',(@{exitCode=$packageExit;target='D:/DriverSchoolRelease/DriverSchool-win32-x64/DriverSchool.exe';fullBuildRequested=$true;previousAttemptInterrupted=$true;completedAt=(Get-Date).ToString('o')}|ConvertTo-Json),[System.Text.UTF8Encoding]::new($false))
}
exit $packageExit

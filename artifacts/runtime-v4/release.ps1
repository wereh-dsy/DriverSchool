# Native tools print normal command banners to stderr. Check exit codes;
# Windows PowerShell must not treat those banners as terminating exceptions.
$ErrorActionPreference='Continue'
Set-Location -LiteralPath D:\dsy\drivergame
[Diagnostics.Process]::GetCurrentProcess().PriorityClass='BelowNormal'
$buildStatus=(Get-Content -LiteralPath artifacts/runtime-v4/build.exit.txt -Raw).Trim()
if($buildStatus -ne '0'){ throw 'Normal build has not passed' }
& node artifacts/runtime-v4/prepare-release.mjs
if($LASTEXITCODE -ne 0){ throw 'Release preflight failed' }
Add-Type -AssemblyName System.Windows.Forms
[ordered]@{capturedAt=(Get-Date).ToString('o');powerLineStatus=[System.Windows.Forms.SystemInformation]::PowerStatus.PowerLineStatus.ToString();powerPlan=(& powercfg /GETACTIVESCHEME | Out-String).Trim();purpose='Build/package and functional EXE smoke only; not a performance benchmark'} | ConvertTo-Json | Set-Content artifacts/runtime-v4/release/conditions.json
$env:DRIVERSCHOOL_RELEASE_DIR='D:/DriverSchoolRelease/DriverSchool-RuntimeV2-Phase4-20261118'
& pnpm run desktop:build 2>&1 | Out-File artifacts/runtime-v4/release/desktop-build.log
if($LASTEXITCODE -ne 0){ throw 'Desktop build failed' }
& node scripts/desktop-package.mjs 2>&1 | Out-File artifacts/runtime-v4/release/package.log
if($LASTEXITCODE -ne 0){ throw 'Desktop package failed' }
& node artifacts/runtime-v4/release/verify-package.mjs 2>&1 | Out-File artifacts/runtime-v4/release/verify.log
if($LASTEXITCODE -ne 0){ throw 'Package verification failed' }
'0' | Set-Content artifacts/runtime-v4/release/package.exit.txt


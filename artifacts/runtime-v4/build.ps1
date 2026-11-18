$ErrorActionPreference='Continue'
Set-Location -LiteralPath 'D:\dsy\drivergame'
[Diagnostics.Process]::GetCurrentProcess().PriorityClass='BelowNormal'
'Running' | Set-Content -LiteralPath artifacts/runtime-v4/build.exit.txt -Encoding utf8
try { & pnpm run build 2>&1 | ForEach-Object { $_.ToString() | Out-File -LiteralPath artifacts/runtime-v4/build.log -Append -Encoding utf8 }; $phase4Exit=$LASTEXITCODE; $phase4Exit | Set-Content -LiteralPath artifacts/runtime-v4/build.exit.txt -Encoding utf8; exit $phase4Exit }
catch { $_ | Out-File -LiteralPath artifacts/runtime-v4/build.log -Append -Encoding utf8; '1' | Set-Content -LiteralPath artifacts/runtime-v4/build.exit.txt;exit 1 }


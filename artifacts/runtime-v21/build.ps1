$ErrorActionPreference='Continue'
Set-Location -LiteralPath 'D:\dsy\drivergame'
[Diagnostics.Process]::GetCurrentProcess().PriorityClass='BelowNormal'
'Running' | Set-Content -LiteralPath artifacts/runtime-v21/build.exit.txt -Encoding utf8
try { & pnpm run build 2>&1 | ForEach-Object { $_.ToString() | Out-File -LiteralPath artifacts/runtime-v21/build.log -Append -Encoding utf8 }; $phase21Exit=$LASTEXITCODE; $phase21Exit | Set-Content -LiteralPath artifacts/runtime-v21/build.exit.txt -Encoding utf8; exit $phase21Exit }
catch { $_ | Out-File -LiteralPath artifacts/runtime-v21/build.log -Append -Encoding utf8; '1' | Set-Content -LiteralPath artifacts/runtime-v21/build.exit.txt;exit 1 }

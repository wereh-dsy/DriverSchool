$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath 'D:\dsy\drivergame'
$log = 'artifacts/performance-round2/build.log'
'running' | Set-Content -LiteralPath 'artifacts/performance-round2/build.exit.txt' -Encoding utf8
'' | Set-Content -LiteralPath $log -Encoding utf8
try {
  & pnpm run build 2>&1 | ForEach-Object { $_.ToString() | Out-File -LiteralPath $log -Append -Encoding utf8 }
  $result = $LASTEXITCODE
  $result | Set-Content -LiteralPath 'artifacts/performance-round2/build.exit.txt' -Encoding utf8
  exit $result
} catch {
  $_ | Out-File -LiteralPath $log -Append -Encoding utf8
  '1' | Set-Content -LiteralPath 'artifacts/performance-round2/build.exit.txt' -Encoding utf8
  exit 1
}


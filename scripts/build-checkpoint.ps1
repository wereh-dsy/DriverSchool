[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
Set-Location -LiteralPath $projectRoot

function Get-SourceFingerprint {
  $sourceFiles = @(
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src'), (Join-Path $projectRoot 'scripts') -Recurse -File
    Get-Item -LiteralPath (Join-Path $projectRoot 'package.json'), (Join-Path $projectRoot 'tsconfig.json'), (Join-Path $projectRoot 'index.html')
    Get-Item -LiteralPath (Join-Path $projectRoot 'vite.config.ts'), (Join-Path $projectRoot 'start-editor.cmd')
  ) | Sort-Object FullName
  # .NET hashing also works in the minimal PowerShell used by the launcher.
  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return (($sourceFiles | ForEach-Object {
      $_.FullName + ':' + [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($_.FullName)))
    }) -join "`n")
  } finally { $hasher.Dispose() }
}

function Invoke-Checked {
  param([string]$Program, [string[]]$Arguments)
  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Validation/build failed ($LASTEXITCODE). The playable dist was not changed." }
}

try {
  $sourceFingerprint = Get-SourceFingerprint
  $packageRunner = (Get-Command pnpm -ErrorAction Stop).Source
  Invoke-Checked -Program $packageRunner -Arguments @('run', 'typecheck')
  Invoke-Checked -Program $packageRunner -Arguments @('run', 'selftest')

  # A new staging folder avoids cleaning or overwriting the playable game.
  $checkpointRoot = Join-Path $projectRoot '.checkpoint-builds'
  $stagingRoot = Join-Path $checkpointRoot ('stage-' + [guid]::NewGuid().ToString('N'))
  $vite = Join-Path $projectRoot 'node_modules\.bin\vite.cmd'
  Invoke-Checked -Program $vite -Arguments @('build', '--outDir', $stagingRoot)
  if ((Get-SourceFingerprint) -ne $sourceFingerprint) {
    throw 'Source changed during validation. Publication was skipped; the previous playable game is intact. Run build again once edits settle.'
  }

  $distRoot = Join-Path $projectRoot 'dist'
  [IO.Directory]::CreateDirectory($distRoot) | Out-Null
  $stagedIndex = Join-Path $stagingRoot 'index.html'
  if (-not (Test-Path -LiteralPath $stagedIndex -PathType Leaf)) { throw 'Staged index.html is missing.' }

  # Hashed assets publish first. Old assets stay available for open browser tabs
  # and the saved last-good index, even if this process is interrupted.
  foreach ($asset in Get-ChildItem -LiteralPath $stagingRoot -Recurse -File) {
    if ($asset.FullName -eq $stagedIndex) { continue }
    $relative = $asset.FullName.Substring($stagingRoot.Length + 1)
    $destination = Join-Path $distRoot $relative
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath $asset.FullName -Destination $destination -Force
  }

  $nextIndex = Join-Path $distRoot '.index-next.html'
  $liveIndex = Join-Path $distRoot 'index.html'
  $lastGoodIndex = Join-Path $checkpointRoot 'last-good-index.html'
  Copy-Item -LiteralPath $stagedIndex -Destination $nextIndex -Force
  if (Test-Path -LiteralPath $liveIndex -PathType Leaf) {
    # Same-volume atomic replacement: index is always either the complete old
    # package or the complete newly validated package, never partially written.
    [IO.File]::Replace($nextIndex, $liveIndex, $lastGoodIndex, $true)
  } else {
    [IO.File]::Move($nextIndex, $liveIndex)
  }
  Write-Host 'Checkpoint published. Double-click start-game.cmd to play; Node.js is not required for playing.'
}
catch {
  Write-Error $_
  exit 1
}

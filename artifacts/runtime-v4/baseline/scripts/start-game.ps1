[CmdletBinding()]
param(
  [switch]$NoOpen,
  [switch]$Dev,
  [ValidateRange(1, 65535)]
  [int]$Port = 5173
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-SupportedNodeVersion {
  param([version]$Version)

  if ($Version.Major -eq 20) {
    return $Version -ge [version]'20.19.0'
  }

  if ($Version.Major -eq 22) {
    return $Version -ge [version]'22.12.0'
  }

  return $Version.Major -gt 22
}

function Invoke-DependencyInstall {
  param([string]$ProjectRoot)

  Write-Host 'Game dependencies are missing. Installing them now...'
  $storeDirectory = Join-Path $ProjectRoot '.pnpm-store'
  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue

  if ($null -ne $pnpm) {
    & $pnpm.Source install --frozen-lockfile --store-dir $storeDirectory
    if ($LASTEXITCODE -eq 0) { return }
    Write-Warning 'pnpm could not install the dependencies; trying another available package manager.'
  }

  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($null -ne $corepack) {
    & $corepack.Source pnpm install --frozen-lockfile --store-dir $storeDirectory
    if ($LASTEXITCODE -eq 0) { return }
    Write-Warning 'Corepack could not install the dependencies; trying npm if it is available.'
  }

  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if ($null -ne $npm) {
    & $npm.Source install
    if ($LASTEXITCODE -eq 0) { return }
  }

  throw 'Dependency installation failed. Check your internet connection, then run this file again.'
}

function Start-PackagedGame {
  param(
    [string]$ProjectRoot,
    [int]$Port,
    [switch]$NoOpen
  )

  $webRoot = Join-Path $ProjectRoot 'dist'
  $serverScript = Join-Path $PSScriptRoot 'serve-built-game.ps1'
  if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'index.html') -PathType Leaf)) {
    throw 'The packaged game is missing. A developer must run pnpm run build once to recreate dist.'
  }

  & $serverScript -WebRoot $webRoot -Port $Port -NoOpen:$NoOpen
}

try {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  Set-Location -LiteralPath $projectRoot

  if (-not $Dev) {
    Start-PackagedGame -ProjectRoot $projectRoot -Port $Port -NoOpen:$NoOpen
    exit 0
  }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $node) {
    throw 'Developer mode requires Node.js 20.19+ or 22.12+. Run start-game.cmd without -Dev to play without Node.js.'
  }

  $nodeVersionText = (& $node.Source --version).Trim().TrimStart('v')
  $nodeVersion = [version]$nodeVersionText
  if (-not (Test-SupportedNodeVersion -Version $nodeVersion)) {
    throw "Developer mode does not support Node.js $nodeVersion. Use Node.js 20.19+ or 22.12+, or run without -Dev."
  }

  $vite = Join-Path $projectRoot 'node_modules\.bin\vite.cmd'
  if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) {
    try {
      Invoke-DependencyInstall -ProjectRoot $projectRoot
    }
    catch {
      throw "Development dependencies could not be installed. Run without -Dev to use the packaged game. $($_.Exception.Message)"
    }
  }

  if (-not (Test-Path -LiteralPath $vite -PathType Leaf)) {
    throw 'Vite is still missing after dependency installation.'
  }

  Write-Host ''
  Write-Host "Starting DriverGame at http://127.0.0.1:$Port/"
  Write-Host 'Keep this window open while playing. Press Ctrl+C here to stop the game server.'
  Write-Host ''

  $viteArguments = @('--host', '127.0.0.1', '--port', $Port.ToString())
  if (-not $NoOpen) {
    $viteArguments += '--open'
  }

  & $vite @viteArguments
  if ($LASTEXITCODE -ne 0) {
    throw "The game server exited with code $LASTEXITCODE."
  }
}
catch {
  Write-Host ''
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}

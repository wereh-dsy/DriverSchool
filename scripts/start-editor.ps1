# Explorer does not inherit Codex's development PATH. Resolve an existing Node
# installation before invoking the same editor launcher used by pnpm.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$editorArguments = @($args)

try {
  $projectRoot = Split-Path -Parent $PSScriptRoot
  Set-Location -LiteralPath $projectRoot
  $candidates = [System.Collections.Generic.List[string]]::new()
  foreach ($command in @(Get-Command node.exe -CommandType Application -All -ErrorAction SilentlyContinue)) {
    $candidates.Add($command.Source)
  }
  foreach ($location in @(
    @{ Root = $env:ProgramFiles; Relative = 'nodejs\node.exe' },
    @{ Root = ${env:ProgramFiles(x86)}; Relative = 'nodejs\node.exe' },
    @{ Root = $env:LOCALAPPDATA; Relative = 'Programs\nodejs\node.exe' },
    @{ Root = $env:NVM_SYMLINK; Relative = 'node.exe' },
    @{ Root = $env:USERPROFILE; Relative = '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
  )) {
    if (-not [string]::IsNullOrWhiteSpace($location.Root)) {
      $candidates.Add((Join-Path $location.Root $location.Relative))
    }
  }

  $nodePath = $null
  foreach ($candidate in @($candidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try {
      $versionText = (& $candidate --version).Trim()
      if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(\d+)\.(\d+)\.(\d+)$') { continue }
      $version = [version]$versionText.Substring(1)
      if (($version.Major -eq 20 -and $version -ge [version]'20.19.0') -or
          ($version.Major -eq 22 -and $version -ge [version]'22.12.0') -or $version.Major -gt 22) {
        $nodePath = $candidate
        break
      }
    } catch { continue }
  }
  if ($null -eq $nodePath) {
    throw 'No supported Node.js installation was found. Node.js 20.19+ or 22.12+ is required for the development Editor.'
  }
  Write-Host "Using Node.js: $nodePath"
  # This environment change is confined to the launcher and its child processes.
  $env:PATH = (Split-Path -Parent $nodePath) + ';' + $env:PATH
  & $nodePath (Join-Path $PSScriptRoot 'start-editor.mjs') @editorArguments
  exit $LASTEXITCODE
} catch {
  Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}

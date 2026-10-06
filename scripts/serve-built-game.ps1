[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$WebRoot,

  [ValidateRange(1, 65535)]
  [int]$Port = 5173,

  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-StaticContentType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.css'  { return 'text/css; charset=utf-8' }
    '.js'   { return 'text/javascript; charset=utf-8' }
    '.mjs'  { return 'text/javascript; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.svg'  { return 'image/svg+xml' }
    '.png'  { return 'image/png' }
    '.jpg'  { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.webp' { return 'image/webp' }
    '.ico'  { return 'image/x-icon' }
    '.wasm' { return 'application/wasm' }
    '.woff' { return 'font/woff' }
    '.woff2' { return 'font/woff2' }
    '.mp3'  { return 'audio/mpeg' }
    '.ogg'  { return 'audio/ogg' }
    default { return 'application/octet-stream' }
  }
}

function Resolve-StaticFile {
  param(
    [string]$Root,
    [string]$RequestTarget
  )

  try {
    $pathOnly = ($RequestTarget -split '\?', 2)[0]
    $decodedPath = [System.Uri]::UnescapeDataString($pathOnly)
    if ($decodedPath.IndexOf([char]0) -ge 0) {
      return $null
    }

    $relativePath = $decodedPath.TrimStart([char[]]@('/', '\'))
    $relativePath = $relativePath.Replace([char]'/', [System.IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($relativePath)) {
      $relativePath = 'index.html'
    }

    $rootPath = [System.IO.Path]::GetFullPath($Root)
    $rootPrefix = $rootPath.TrimEnd([char[]]@('/', '\')) + [System.IO.Path]::DirectorySeparatorChar
    $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootPath, $relativePath))

    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $null
    }

    if (Test-Path -LiteralPath $candidate -PathType Container) {
      $candidate = Join-Path $candidate 'index.html'
    }

    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }

    # Keep future client-side routes working without exposing anything outside dist.
    if ([string]::IsNullOrEmpty([System.IO.Path]::GetExtension($relativePath))) {
      $indexPath = Join-Path $rootPath 'index.html'
      if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
        return $indexPath
      }
    }
  }
  catch {
    return $null
  }

  return $null
}

function Send-HttpResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$IncludeBody
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`n" +
    "Content-Type: $ContentType`r`n" +
    "Content-Length: $($Body.Length)`r`n" +
    "Cache-Control: no-cache`r`n" +
    "X-Content-Type-Options: nosniff`r`n" +
    "Connection: close`r`n`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($IncludeBody -and $Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
  $Stream.Flush()
}

function Send-TextResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$Message,
    [bool]$IncludeBody
  )

  $body = [System.Text.Encoding]::UTF8.GetBytes($Message)
  Send-HttpResponse -Stream $Stream -StatusCode $StatusCode -StatusText $StatusText `
    -ContentType 'text/plain; charset=utf-8' -Body $body -IncludeBody $IncludeBody
}

$resolvedRoot = [System.IO.Path]::GetFullPath($WebRoot)
$indexFile = Join-Path $resolvedRoot 'index.html'
if (-not (Test-Path -LiteralPath $indexFile -PathType Leaf)) {
  throw "Packaged game not found: $indexFile"
}

$indexMarkup = [System.IO.File]::ReadAllText($indexFile)
$assetReferences = [System.Text.RegularExpressions.Regex]::Matches(
  $indexMarkup,
  '(?:src|href)=["''](?<path>/[^"''?#]+)["'']',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)
foreach ($assetReference in $assetReferences) {
  $assetPath = Resolve-StaticFile -Root $resolvedRoot -RequestTarget $assetReference.Groups['path'].Value
  if ($null -eq $assetPath) {
    throw "The packaged game is incomplete. Missing asset: $($assetReference.Groups['path'].Value)"
  }
}

$listener = $null
$selectedPort = $Port
$lastListenError = $null
$maximumPort = [Math]::Min(65535, $Port + 20)

for ($candidatePort = $Port; $candidatePort -le $maximumPort; $candidatePort++) {
  $candidateListener = $null
  try {
    $candidateListener = [System.Net.Sockets.TcpListener]::new(
      [System.Net.IPAddress]::Loopback,
      $candidatePort
    )
    $candidateListener.Start()
    $listener = $candidateListener
    $selectedPort = $candidatePort
    break
  }
  catch [System.Net.Sockets.SocketException] {
    $lastListenError = $_
    if ($null -ne $candidateListener) {
      $candidateListener.Stop()
    }
  }
}

if ($null -eq $listener) {
  throw "No free local port was found between $Port and $maximumPort. $($lastListenError.Exception.Message)"
}

$gameUrl = "http://127.0.0.1:$selectedPort/"
Write-Host ''
Write-Host 'Starting the packaged DriverGame (Node.js is not required).'
Write-Host "Game address: $gameUrl"
Write-Host 'Keep this window open while playing. Press Ctrl+C here to stop the game.'
Write-Host ''

if (-not $NoOpen) {
  try {
    Start-Process $gameUrl
  }
  catch {
    Write-Warning "The browser could not be opened automatically. Open $gameUrl manually."
  }
}

try {
  while ($true) {
    if (-not $listener.Pending()) {
      Start-Sleep -Milliseconds 100
      continue
    }

    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 5000
      $client.SendTimeout = 5000
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::ASCII,
        $false,
        1024,
        $true
      )

      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      $requestParts = $requestLine.Split(' ')
      if ($requestParts.Length -lt 2) {
        Send-TextResponse -Stream $stream -StatusCode 400 -StatusText 'Bad Request' `
          -Message 'Bad request.' -IncludeBody $true
        continue
      }

      $method = $requestParts[0].ToUpperInvariant()
      $requestTarget = $requestParts[1]
      $headerCount = 0
      while ($headerCount -lt 100) {
        $headerLine = $reader.ReadLine()
        if ($null -eq $headerLine -or $headerLine.Length -eq 0) {
          break
        }
        $headerCount++
      }

      $includeBody = $method -ne 'HEAD'
      if ($method -ne 'GET' -and $method -ne 'HEAD') {
        Send-TextResponse -Stream $stream -StatusCode 405 -StatusText 'Method Not Allowed' `
          -Message 'Only GET and HEAD are supported.' -IncludeBody $includeBody
        continue
      }

      $filePath = Resolve-StaticFile -Root $resolvedRoot -RequestTarget $requestTarget
      if ($null -eq $filePath) {
        Send-TextResponse -Stream $stream -StatusCode 404 -StatusText 'Not Found' `
          -Message 'Not found.' -IncludeBody $includeBody
        continue
      }

      $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
      Send-HttpResponse -Stream $stream -StatusCode 200 -StatusText 'OK' `
        -ContentType (Get-StaticContentType -Path $filePath) -Body $fileBytes -IncludeBody $includeBody
    }
    catch {
      Write-Warning "A local browser request failed: $($_.Exception.Message)"
    }
    finally {
      if ($null -ne $client) {
        $client.Dispose()
      }
    }
  }
}
finally {
  $listener.Stop()
}

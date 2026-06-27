$ErrorActionPreference = "Stop"

function Join-WorkspacePath {
  param([Parameter(Mandatory=$true)][string[]]$Parts)
  $current = $WorkspaceRoot
  foreach ($part in $Parts) {
    $current = Join-Path -Path $current -ChildPath $part
  }
  return $current
}

function Assert-InWorkspace {
  param([Parameter(Mandatory=$true)][string]$PathToCheck)
  $resolvedRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
  $resolvedPath = [System.IO.Path]::GetFullPath($PathToCheck)
  if (-not ($resolvedPath.Equals($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or $resolvedPath.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Refusing to write outside workspace: $resolvedPath"
  }
}

function Assert-OfficialNodeUri {
  param([Parameter(Mandatory=$true)][string]$Uri)
  $parsed = [System.Uri]::new($Uri)
  if ($parsed.Scheme -ne "https") { throw "Refusing non-HTTPS URL: $Uri" }
  if ($parsed.Host -ne "nodejs.org") { throw "Refusing non-official Node.js host: $($parsed.Host)" }
}

$ScriptPath = $MyInvocation.MyCommand.Path
$ToolsDir = Split-Path -Parent $ScriptPath
$WorkspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $ToolsDir ".."))
$NodeVersionFile = Join-Path $WorkspaceRoot ".node-version"
if (-not (Test-Path -LiteralPath $NodeVersionFile)) { throw ".node-version is missing" }
$NodeVersion = (Get-Content -LiteralPath $NodeVersionFile -Raw).Trim()
if ($NodeVersion -notmatch '^v\d+\.\d+\.\d+$') { throw "Unsupported Node version format: $NodeVersion" }

$ArchiveName = "node-$NodeVersion-win-x64.zip"
$BaseUri = "https://nodejs.org/dist/$NodeVersion"
$ArchiveUri = "$BaseUri/$ArchiveName"
$ShasumsUri = "$BaseUri/SHASUMS256.txt"
Assert-OfficialNodeUri $ArchiveUri
Assert-OfficialNodeUri $ShasumsUri

$ToolchainDir = Join-WorkspacePath @(".toolchain")
$NodeDir = Join-WorkspacePath @(".toolchain", "node")
$LocalDir = Join-WorkspacePath @(".local", "node-downloads", $NodeVersion)
$ArchivePath = Join-Path $LocalDir $ArchiveName
$ShasumsPath = Join-Path $LocalDir "SHASUMS256.txt"
$TempExtractDir = Join-WorkspacePath @(".local", "node-extract", $NodeVersion)

foreach ($path in @($ToolchainDir, $LocalDir, $TempExtractDir)) {
  Assert-InWorkspace $path
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

$ExistingNode = Join-Path $NodeDir "node.exe"
if (Test-Path -LiteralPath $ExistingNode) {
  $existingVersion = (& $ExistingNode --version).Trim()
  if ($existingVersion -eq $NodeVersion) {
    Write-Host "Portable Node already installed: $existingVersion"
    & $ExistingNode --version
    & (Join-Path $NodeDir "npm.cmd") --version
    exit 0
  }
  throw "Portable Node exists with version $existingVersion, expected $NodeVersion. Remove .toolchain/node manually if this is intentional."
}

Write-Host "Downloading official Node.js archive: $ArchiveUri"
Invoke-WebRequest -Uri $ArchiveUri -OutFile $ArchivePath -UseBasicParsing
Write-Host "Downloading official Node.js checksums: $ShasumsUri"
Invoke-WebRequest -Uri $ShasumsUri -OutFile $ShasumsPath -UseBasicParsing

$expectedLine = Get-Content -LiteralPath $ShasumsPath | Where-Object { $_ -match "\s$([regex]::Escape($ArchiveName))$" } | Select-Object -First 1
if (-not $expectedLine) { throw "No official SHA-256 entry found for $ArchiveName" }
$expectedHash = ($expectedLine -split '\s+')[0].ToUpperInvariant()
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ArchivePath).Hash.ToUpperInvariant()
Write-Host "Official SHA-256: $expectedHash"
Write-Host "Archive  SHA-256: $actualHash"
if ($expectedHash -ne $actualHash) { throw "Node archive SHA-256 mismatch" }

if (Test-Path -LiteralPath $TempExtractDir) { Remove-Item -LiteralPath $TempExtractDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TempExtractDir | Out-Null
Expand-Archive -LiteralPath $ArchivePath -DestinationPath $TempExtractDir -Force

$ExtractedRoot = Join-Path $TempExtractDir "node-$NodeVersion-win-x64"
Assert-InWorkspace $ExtractedRoot
if (-not (Test-Path -LiteralPath (Join-Path $ExtractedRoot "node.exe"))) { throw "Extracted archive does not contain node.exe" }

if (Test-Path -LiteralPath $NodeDir) { Remove-Item -LiteralPath $NodeDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
Get-ChildItem -LiteralPath $ExtractedRoot -Force | Copy-Item -Destination $NodeDir -Recurse -Force

foreach ($required in @("node.exe", "npm.cmd", "npx.cmd")) {
  $requiredPath = Join-Path $NodeDir $required
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Missing portable tool: $requiredPath" }
}

Write-Host "Portable Node installed in: $NodeDir"
& (Join-Path $NodeDir "node.exe") --version
& (Join-Path $NodeDir "npm.cmd") --version

param(
  [string]$SourceDir = (Join-Path $env:APPDATA 'jiaojiao')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
  throw "未找到目录: $SourceDir"
}

$sourcePath = (Resolve-Path -LiteralPath $SourceDir).Path
$parentDir = Split-Path -Parent $sourcePath
$timestamp = Get-Date -Format 'yyyyMMdd_HHmm'
$baseName = "jiaojiao_$timestamp"
$targetPath = Join-Path $parentDir $baseName

$index = 1
while (Test-Path -LiteralPath $targetPath) {
  $targetPath = Join-Path $parentDir ("{0}_{1}" -f $baseName, $index)
  $index += 1
}

Move-Item -LiteralPath $sourcePath -Destination $targetPath

Write-Host "备份完成: $targetPath"
Start-Process explorer.exe $targetPath

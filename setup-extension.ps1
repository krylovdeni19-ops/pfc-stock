$ErrorActionPreference = 'Stop'
$site = (Read-Host 'Paste your published GitHub Pages URL').Trim().TrimEnd('/') + '/'
if ($site -notmatch '^https://[a-zA-Z0-9-]+\.github\.io/(?:[a-zA-Z0-9._-]+/)?$') { throw 'Expected https://USERNAME.github.io/REPOSITORY/' }
$folder = Join-Path $PSScriptRoot 'warehouse-extension'
Expand-Archive (Join-Path $PSScriptRoot 'pfc-chrome.zip') $folder -Force
$extension = Join-Path $folder 'pfc-chrome'
foreach ($name in @('manifest.json','open.js')) {
  $path = Join-Path $extension $name
  $source = [IO.File]::ReadAllText($path)
  [IO.File]::WriteAllText($path, $source.Replace('https://grizzly-hug-pfc-stock.vernalfloat4.chatgpt.site/', $site), (New-Object System.Text.UTF8Encoding($false)))
}
Write-Host "Load unpacked extension from: $extension"

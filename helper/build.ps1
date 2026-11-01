# Builds dist\PotDl-Setup.exe with the C# compiler included in Windows.

$ErrorActionPreference = 'Stop'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$root = Split-Path $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# An .ico file is a small index followed by the PNG images.
function Write-Icon($path) {
    $images = 16, 48, 128 | ForEach-Object {
        [pscustomobject]@{ Size = $_; Bytes = [IO.File]::ReadAllBytes((Join-Path $root "icons\icon$_.png")) }
    }
    $stream = [IO.File]::Create($path)
    $writer = New-Object IO.BinaryWriter $stream
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)
    $offset = 6 + 16 * $images.Count
    foreach ($image in $images) {
        $writer.Write([byte]$image.Size)
        $writer.Write([byte]$image.Size)
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$image.Bytes.Length)
        $writer.Write([uint32]$offset)
        $offset += $image.Bytes.Length
    }
    foreach ($image in $images) { $writer.Write($image.Bytes) }
    $writer.Dispose()
}

$icon = Join-Path $dist 'PotDl.ico'
Write-Icon $icon

$helper = Join-Path $dist 'PotDlHelper.exe'
$setup = Join-Path $dist 'PotDl-Setup.exe'

& $csc /nologo /optimize+ /target:exe "/out:$helper" "/win32icon:$icon" `
    /reference:System.Management.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'PotDlHelper.cs')
if ($LASTEXITCODE) { throw 'Helper build failed' }

& $csc /nologo /optimize+ /target:winexe "/out:$setup" "/win32icon:$icon" "/resource:$helper,PotDlHelper.exe" `
    /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'PotDlSetup.cs')
if ($LASTEXITCODE) { throw 'Setup build failed' }

Remove-Item $icon, $helper
Get-Item $setup | Select-Object Name, Length

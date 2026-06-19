param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\build'))

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$PublicDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public'))
[System.IO.Directory]::CreateDirectory($PublicDirectory) | Out-Null

function New-RoundedRectanglePath {
  param([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-ChatNestBitmap {
  param([int]$Size)
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $scale = $Size / 1024.0
  $graphics.ScaleTransform($scale, $scale)

  $background = New-RoundedRectanglePath 64 64 896 896 220
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(180, 120),
    [System.Drawing.PointF]::new(850, 920),
    [System.Drawing.Color]::FromArgb(255, 55, 205, 123),
    [System.Drawing.Color]::FromArgb(255, 18, 137, 73)
  )
  $graphics.FillPath($gradient, $background)

  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $greenPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 35, 170, 95), 28)
  $graphics.FillEllipse($white, 185, 245, 525, 365)
  $graphics.FillPolygon($white, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(225, 530),
    [System.Drawing.PointF]::new(175, 690),
    [System.Drawing.PointF]::new(350, 590)
  ))
  $graphics.FillEllipse($white, 455, 470, 390, 285)
  $graphics.DrawEllipse($greenPen, 455, 470, 390, 285)
  $graphics.FillPolygon($white, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(770, 685),
    [System.Drawing.PointF]::new(850, 810),
    [System.Drawing.PointF]::new(685, 735)
  ))

  $greenPen.Dispose()
  $white.Dispose()
  $gradient.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  return $bitmap
}

function Get-PngBytes {
  param([int]$Size)
  $bitmap = New-ChatNestBitmap $Size
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  $bytes = $stream.ToArray()
  $stream.Dispose()
  Write-Output -NoEnumerate $bytes
}

function Write-BigEndianInt32 {
  param([System.IO.Stream]$Stream, [int]$Value)
  $bytes = [System.BitConverter]::GetBytes($Value)
  [System.Array]::Reverse($bytes)
  $Stream.Write($bytes, 0, 4)
}

$png1024 = Get-PngBytes 1024
[System.IO.File]::WriteAllBytes((Join-Path $OutputDirectory 'icon.png'), $png1024)
[System.IO.File]::WriteAllBytes((Join-Path $PublicDirectory 'favicon.png'), $png1024)

$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$icoImages = @($icoSizes | ForEach-Object { Get-PngBytes $_ })
$icoPath = Join-Path $OutputDirectory 'icon.ico'
$icoStream = [System.IO.File]::Create($icoPath)
$icoWriter = [System.IO.BinaryWriter]::new($icoStream)
$icoWriter.Write([uint16]0)
$icoWriter.Write([uint16]1)
$icoWriter.Write([uint16]$icoSizes.Count)
$offset = 6 + (16 * $icoSizes.Count)
for ($index = 0; $index -lt $icoSizes.Count; $index++) {
  $size = $icoSizes[$index]
  $image = $icoImages[$index]
  $icoWriter.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
  $icoWriter.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
  $icoWriter.Write([byte]0)
  $icoWriter.Write([byte]0)
  $icoWriter.Write([uint16]1)
  $icoWriter.Write([uint16]32)
  $icoWriter.Write([uint32]$image.Length)
  $icoWriter.Write([uint32]$offset)
  $offset += $image.Length
}
foreach ($image in $icoImages) { $icoWriter.Write($image) }
$icoWriter.Dispose()
$icoStream.Dispose()

$icnsEntries = @(
  @{ Type = 'icp4'; Size = 16 },
  @{ Type = 'icp5'; Size = 32 },
  @{ Type = 'icp6'; Size = 64 },
  @{ Type = 'ic07'; Size = 128 },
  @{ Type = 'ic08'; Size = 256 },
  @{ Type = 'ic09'; Size = 512 },
  @{ Type = 'ic10'; Size = 1024 }
)
$icnsImages = @($icnsEntries | ForEach-Object { Get-PngBytes $_.Size })
$icnsLength = 8
foreach ($image in $icnsImages) { $icnsLength += 8 + $image.Length }
$icnsPath = Join-Path $OutputDirectory 'icon.icns'
$icnsStream = [System.IO.File]::Create($icnsPath)
$magic = [System.Text.Encoding]::ASCII.GetBytes('icns')
$icnsStream.Write($magic, 0, $magic.Length)
Write-BigEndianInt32 $icnsStream $icnsLength
for ($index = 0; $index -lt $icnsEntries.Count; $index++) {
  $type = [System.Text.Encoding]::ASCII.GetBytes($icnsEntries[$index].Type)
  $image = $icnsImages[$index]
  $icnsStream.Write($type, 0, 4)
  Write-BigEndianInt32 $icnsStream (8 + $image.Length)
  $icnsStream.Write($image, 0, $image.Length)
}
$icnsStream.Dispose()

Write-Host "Generated application icons in $OutputDirectory and public/favicon.png"

# SPDX-License-Identifier: MPL-2.0
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Destination = "$PSScriptRoot\mejorados"
)

Add-Type -AssemblyName System.Drawing
$null = New-Item -ItemType Directory -Force -Path "$Destination\icons"
$original = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
$sizes = @(16, 32, 48, 64, 96, 128, 256, 512, 1024)
try {
  foreach ($size in $sizes) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $rect = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
      $graphics.DrawImage($original, $rect, 0, 0, $original.Width, $original.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
      $bitmap.Save("$Destination\icons\icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $attributes.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $original.Dispose()
}

# ICO multirresolucion con entradas PNG que conservan transparencia.
$icoSizes = @(16, 32, 48, 64, 128, 256)
$entries = @($icoSizes | ForEach-Object { ,([System.IO.File]::ReadAllBytes("$Destination\icons\icon-$_.png")) })
$stream = [System.IO.File]::Create("$Destination\zorro.ico")
$writer = [System.IO.BinaryWriter]::new($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$icoSizes.Count)
  $offset = 6 + 16 * $icoSizes.Count
  for ($i = 0; $i -lt $icoSizes.Count; $i++) {
    $dimension = if ($icoSizes[$i] -eq 256) { 0 } else { $icoSizes[$i] }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$entries[$i].Length)
    $writer.Write([uint32]$offset)
    $offset += $entries[$i].Length
  }
  foreach ($entry in $entries) { $writer.Write([byte[]]$entry) }
} finally {
  $writer.Dispose()
}

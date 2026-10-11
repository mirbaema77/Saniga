Add-Type -AssemblyName System.Drawing

$W = 1100
$H = 280
$bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

$color = [System.Drawing.Color]::FromArgb(255, 18, 184, 225)
$brush = New-Object System.Drawing.SolidBrush $color
$pen = New-Object System.Drawing.Pen $color, 15
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$font = New-Object System.Drawing.Font "Arial Black", 110, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$text = "SANIGA"
$x = 40
$textTop = 100

# Accurate glyph ranges for N (3rd character, index 2)
$ranges = [System.Drawing.CharacterRange[]]@(New-Object System.Drawing.CharacterRange 2, 1)
$sf = New-Object System.Drawing.StringFormat
$sf.SetMeasurableCharacterRanges($ranges)
$layout = New-Object System.Drawing.RectangleF $x, $textTop, 1000, 200
$regions = $g.MeasureCharacterRanges($text, $font, $layout, $sf)
$nBounds = $regions[0].GetBounds($g)
# N glyph bounds are slightly left-heavy in Arial Black; bias center for visual balance.
$nCenter = $nBounds.X + ($nBounds.Width * 0.58)
$radius = [Math]::Max(28, $nBounds.Width * 0.40)
$archTop = 34
$rect = New-Object System.Drawing.RectangleF (($nCenter - $radius), $archTop, ($radius * 2), ($radius * 1.85))
$g.DrawArc($pen, $rect, 205, 130)

$g.DrawString($text, $font, $brush, $x, $textTop)

$tmp = Join-Path $PSScriptRoot "..\public\assets\_logo-tmp.png"
$bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $pen.Dispose(); $font.Dispose(); $sf.Dispose()
Write-Output "nBounds=$nBounds"
Write-Output "saved $tmp"

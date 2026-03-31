# Serves this folder at http://127.0.0.1:8765/ — no Python or Node needed.
# Run:  powershell -ExecutionPolicy Bypass -File .\serve_demo.ps1
#   or: right-click -> Run with PowerShell

param(
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$prefix = "http://127.0.0.1:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Could not start (port $Port in use or blocked?): $_" -ForegroundColor Red
    exit 1
}

$url = "${prefix}demo.html"
Write-Host ""
Write-Host "  Demo:  $url" -ForegroundColor Cyan
Write-Host "  Stop:  Ctrl+C"
Write-Host ""

if (-not $NoBrowser) {
    Start-Process $url
}

$mimes = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
}

$rootFull = [System.IO.Path]::GetFullPath($root)

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $raw = $req.Url.AbsolutePath.TrimStart('/')
        $path = if ($raw) { [Uri]::UnescapeDataString($raw) } else { 'demo.html' }
        $candidate = Join-Path $root $path
        $safe = [System.IO.Path]::GetFullPath($candidate)

        if (-not $safe.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
            $res.StatusCode = 403
            $res.Close()
            continue
        }

        if (Test-Path -LiteralPath $safe -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($safe)
            $ext = [System.IO.Path]::GetExtension($safe).ToLowerInvariant()
            $res.ContentType = $mimes[$ext]
            if (-not $res.ContentType) { $res.ContentType = 'application/octet-stream' }
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
            $msg = [Text.Encoding]::UTF8.GetBytes('Not found')
            $res.ContentType = 'text/plain; charset=utf-8'
            $res.ContentLength64 = $msg.Length
            $res.OutputStream.Write($msg, 0, $msg.Length)
        }
        $res.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}

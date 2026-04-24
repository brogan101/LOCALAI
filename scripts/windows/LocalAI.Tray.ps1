#Requires -Version 5.1
<#
.SYNOPSIS
    LocalAI system-tray icon for Windows.
.DESCRIPTION
    Sits in the system tray while LocalAI is running.
    Two menu items:
      - "Open Control Center" — opens http://127.0.0.1:5173 in the default browser
      - "Kill AI Processes"   — POSTs to /api/system/process/kill-switch
    Exits cleanly when LocalAI shuts down or when the user chooses Exit.
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Config ────────────────────────────────────────────────────────────────────

$ApiBase    = if ($env:LOCALAI_API_URL)  { $env:LOCALAI_API_URL  } else { "http://127.0.0.1:3001" }
$FrontendUrl = if ($env:LOCALAI_UI_URL) { $env:LOCALAI_UI_URL   } else { "http://127.0.0.1:5173" }

# ── Icon ──────────────────────────────────────────────────────────────────────
# Build a minimal 16x16 icon in memory (filled circle, accent color #6366f1)

function New-TrayIcon {
    $bmp = [System.Drawing.Bitmap]::new(16, 16)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
    $g.FillEllipse($brush, 1, 1, 14, 14)
    $brush.Dispose()
    $g.Dispose()
    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $bmp.Dispose()
    return $icon
}

# ── Context menu ──────────────────────────────────────────────────────────────

$menu = [System.Windows.Forms.ContextMenuStrip]::new()

$itemOpen       = [System.Windows.Forms.ToolStripMenuItem]::new("Open Control Center")
$itemKill       = [System.Windows.Forms.ToolStripMenuItem]::new("Kill AI Processes")
$itemSeparator  = [System.Windows.Forms.ToolStripSeparator]::new()
$itemExit       = [System.Windows.Forms.ToolStripMenuItem]::new("Exit")

$menu.Items.Add($itemOpen)      | Out-Null
$menu.Items.Add($itemKill)      | Out-Null
$menu.Items.Add($itemSeparator) | Out-Null
$menu.Items.Add($itemExit)      | Out-Null

# ── Tray icon ─────────────────────────────────────────────────────────────────

$tray = [System.Windows.Forms.NotifyIcon]::new()
$tray.Icon             = New-TrayIcon
$tray.Text             = "LocalAI Control Center"
$tray.ContextMenuStrip = $menu
$tray.Visible          = $true

# Double-click opens the UI
$tray.add_DoubleClick({
    Start-Process $FrontendUrl
})

# ── Event handlers ────────────────────────────────────────────────────────────

$itemOpen.add_Click({
    Start-Process $FrontendUrl
})

$itemKill.add_Click({
    $result = [System.Windows.Forms.MessageBox]::Show(
        "Terminate all AI processes?",
        "LocalAI — Kill Switch",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
        try {
            Invoke-RestMethod -Uri "$ApiBase/api/system/process/kill-switch" `
                              -Method Post `
                              -ErrorAction Stop | Out-Null
            [System.Windows.Forms.MessageBox]::Show(
                "Kill-switch invoked successfully.",
                "LocalAI",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Information
            ) | Out-Null
        } catch {
            [System.Windows.Forms.MessageBox]::Show(
                "Failed to invoke kill-switch:`n$($_.Exception.Message)",
                "LocalAI — Error",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Error
            ) | Out-Null
        }
    }
})

$itemExit.add_Click({
    $tray.Visible = $false
    $tray.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

# ── Run ───────────────────────────────────────────────────────────────────────

[System.Windows.Forms.Application]::Run()

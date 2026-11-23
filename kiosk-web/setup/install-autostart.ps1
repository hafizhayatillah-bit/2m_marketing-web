<#
  Pasang auto-start kiosk 2M Sembako di PC kiosk (jalankan sebagai user kiosk, tidak perlu admin).

  Contoh:
    powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Url "https://twom-kiosk.onrender.com/?branch=10&paper=58"

  Lepas lagi:
    powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Uninstall

  Yang dilakukan:
    1. Menyalin kiosk-watchdog.ps1 ke %LOCALAPPDATA%\2m-kiosk\
    2. Membuat shortcut "2M Kiosk" di folder Startup user ini. Saat login, shortcut menjalankan
       watchdog (jendela minimized) yang membuka Chrome kiosk dan membukanya lagi kalau tertutup.
#>
param(
  [string]$Url = "",
  [string]$ProfileDir = "C:\kiosk-chrome",
  [switch]$Uninstall,
  [switch]$StartNow
)

$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:LOCALAPPDATA "2m-kiosk"
$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "2M Kiosk.lnk"

if ($Uninstall) {
  if (Test-Path $shortcutPath) { Remove-Item $shortcutPath -Force; "Shortcut Startup dihapus." }
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like "*kiosk-watchdog.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "Watchdog (PID $($_.ProcessId)) dihentikan." }
  if (Test-Path $installDir) { Remove-Item $installDir -Recurse -Force; "Folder $installDir dihapus." }
  "Selesai. Profil Chrome $ProfileDir (berisi token kiosk) TIDAK dihapus."
  return
}

if (-not $Url) { throw "Isi -Url, contoh: -Url `"https://twom-kiosk.onrender.com/?branch=10&paper=58`"" }
if ($Url -notmatch '^https?://') { throw "URL harus diawali http:// atau https://" }

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome tidak ditemukan. Install Chrome dulu." }

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
$watchdog = Join-Path $installDir "kiosk-watchdog.ps1"
Copy-Item (Join-Path $PSScriptRoot "kiosk-watchdog.ps1") $watchdog -Force

$psExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($shortcutPath)
$lnk.TargetPath = $psExe
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdog`" -Url `"$Url`" -ProfileDir `"$ProfileDir`" -ChromePath `"$chrome`""
$lnk.WorkingDirectory = $installDir
$lnk.WindowStyle = 7  # minimized
$lnk.Description = "Buka kiosk 2M Sembako saat login"
$lnk.Save()

"Terpasang."
"  Shortcut : $shortcutPath"
"  Watchdog : $watchdog"
"  Chrome   : $chrome"
"  Profil   : $ProfileDir"
"  URL      : $Url"
""
"Maintenance: buat file $ProfileDir\STOP supaya Chrome tidak dibuka ulang, lalu Alt+F4."
"Hapus file STOP untuk mengaktifkan lagi. Log: $ProfileDir\watchdog.log"

if ($StartNow) {
  Start-Process -FilePath $psExe -ArgumentList $lnk.Arguments -WindowStyle Hidden
  "Watchdog dijalankan sekarang."
}

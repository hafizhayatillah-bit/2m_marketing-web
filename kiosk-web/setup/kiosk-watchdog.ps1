<#
  Watchdog kiosk 2M Sembako.
  Dijalankan otomatis saat login (lewat shortcut Startup yang dibuat install-autostart.ps1).
  - Menunggu internet/server siap (maks ~90 detik) supaya Chrome tidak membuka halaman error.
  - Membuka Chrome kiosk (fullscreen + print tanpa dialog).
  - Tiap 10 detik cek: kalau Chrome kiosk tertutup/crash, dibuka lagi.
  - Maintenance: buat file STOP di folder profil (default C:\kiosk-chrome\STOP) supaya watchdog
    tidak membuka ulang Chrome. Hapus file itu untuk mengaktifkan lagi.
#>
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$ProfileDir = "C:\kiosk-chrome",
  [string]$ChromePath = "",
  [int]$IntervalSeconds = 10
)

$ErrorActionPreference = "Continue"

if (-not $ChromePath) {
  $ChromePath = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $ChromePath) { exit 1 }

$stopFile = Join-Path $ProfileDir "STOP"
$logFile = Join-Path $ProfileDir "watchdog.log"
New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

function Write-KioskLog([string]$msg) {
  try { Add-Content -Path $logFile -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg) } catch {}
}

function Test-KioskRunning {
  $needle = "*--user-data-dir=$ProfileDir*"
  $procs = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue
  return [bool]($procs | Where-Object { $_.CommandLine -like $needle } | Select-Object -First 1)
}

function Wait-Server {
  for ($i = 0; $i -lt 18; $i++) {
    try {
      Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 5 | Out-Null
      return
    } catch {
      # Respons HTTP apa pun (mis. 404/405) berarti server sudah bisa dijangkau.
      if ($_.Exception.Response) { return }
      Start-Sleep -Seconds 5
    }
  }
  Write-KioskLog "Server belum bisa dijangkau setelah 90 detik, Chrome tetap dibuka."
}

$chromeArgs = @(
  "--kiosk",
  "--kiosk-printing",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-pinch",
  "--overscroll-history-navigation=0",
  "--disable-features=TranslateUI",
  "--disable-session-crashed-bubble",
  "--hide-crash-restore-bubble",
  "--user-data-dir=$ProfileDir",
  "`"$Url`""
)

Write-KioskLog "Watchdog mulai. URL=$Url"
$firstLaunch = $true
while ($true) {
  # STOP.txt juga dihitung: Notepad sering menambahkan .txt saat membuat file baru.
  if (-not ((Test-Path $stopFile) -or (Test-Path "$stopFile.txt"))) {
    if (-not (Test-KioskRunning)) {
      if ($firstLaunch) { Wait-Server }
      Write-KioskLog "Membuka Chrome kiosk."
      Start-Process -FilePath $ChromePath -ArgumentList $chromeArgs
      $firstLaunch = $false
      Start-Sleep -Seconds 15  # beri waktu Chrome start sebelum dicek lagi
      continue
    }
  }
  Start-Sleep -Seconds $IntervalSeconds
}

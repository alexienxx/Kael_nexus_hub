<#
.SYNOPSIS
    Build and install Kael APK.

.DESCRIPTION
    Modalita' PROD (default):
        L'APK carica la UI locale da dist/.

    Modalita' LOVABLE (-Mode lovable):
        Consentita solo se capacitor.config.ts contiene una vera server.url remota.
        Se manca server.url, lo script fallisce esplicitamente.

  Entrambe le modalita' supportano ADB WiFi (senza cavo).

.PARAMETER Mode
    prod (default) | lovable

.PARAMETER AdbWifi
  Se presente, configura ADB su WiFi cosi' le build successive non servono cavo.

.PARAMETER PhoneIp
  IP del telefono sulla rete locale (necessario solo con -AdbWifi la prima volta).

.PARAMETER SkipInstall
  Se presente, builda l'APK ma non lo installa.

.EXAMPLE
    .\build_apk.ps1                         # build prod (default) + install
  .\build_apk.ps1 -Mode prod              # build produzione + install
    .\build_apk.ps1 -Mode lovable -AdbWifi -PhoneIp 192.168.178.XX
#>

param(
        [ValidateSet("prod","lovable")]
        [string]$Mode = "prod",

    [switch]$AdbWifi,
    [switch]$SkipInstall,

    [string]$PhoneIp
)

$ErrorActionPreference = "Stop"

#-- Paths
$ProjectRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$CapConfigMain = Join-Path $ProjectRoot "capacitor.config.ts"
$CapConfigProd = Join-Path $ProjectRoot "capacitor.config.prod.ts"
$AndroidDir    = Join-Path $ProjectRoot "android"
$LocalProps    = Join-Path $AndroidDir  "local.properties"
$PackageLock   = Join-Path $ProjectRoot "package-lock.json"
$BunLock       = Join-Path $ProjectRoot "bun.lock"
$BunLockBin    = Join-Path $ProjectRoot "bun.lockb"
$AdbExe        = "C:\Users\princ\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$BuildTools    = "C:\Users\princ\AppData\Local\Android\Sdk\build-tools\36.0.0"
$ApkSigner     = Join-Path $BuildTools "apksigner.bat"
$ZipAlign      = Join-Path $BuildTools "zipalign.exe"
$DebugKs       = "$env:USERPROFILE\.android\debug.keystore"
$ApkDir        = Join-Path $AndroidDir "app\build\outputs\apk\release"

#-- JDK 21 (Gradle compatibility)
$env:JAVA_HOME = "C:\Program Files\Android\openjdk\jdk-21.0.8"

#-- ADB WiFi setup
if ($AdbWifi) {
    if (-not $PhoneIp) {
        Write-Host "[ERROR] Specifica -PhoneIp <ip-telefono> per ADB WiFi" -ForegroundColor Red
        Write-Host "  Esempio: .\build_apk.ps1 -AdbWifi -PhoneIp 192.168.178.50" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[ADB WiFi] Attivo tcpip 5555 sul device USB..." -ForegroundColor Cyan
    & $AdbExe tcpip 5555
    Start-Sleep -Seconds 2
    Write-Host "[ADB WiFi] Connetto a ${PhoneIp}:5555..." -ForegroundColor Cyan
    & $AdbExe connect "${PhoneIp}:5555"
    Start-Sleep -Seconds 1
    Write-Host "[ADB WiFi] Ora puoi staccare il cavo USB!" -ForegroundColor Green
}

#-- Banner
Write-Host ""
Write-Host "=== KAEL APK BUILD ===" -ForegroundColor Cyan
Write-Host "  Mode: $Mode" -ForegroundColor White

#-- Check ADB device (skip if SkipInstall)
if (-not $SkipInstall) {
    $devices = & $AdbExe devices 2>&1 | Select-String "device$"
    if (-not $devices) {
        Write-Host "[ERROR] Nessun device connesso (ne USB ne WiFi)" -ForegroundColor Red
        Write-Host "  Collega via USB o usa: .\build_apk.ps1 -AdbWifi -PhoneIp <ip>" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  Device: $($devices.Line.Split()[0])" -ForegroundColor Green
}

#-- Ensure local.properties
if (-not (Test-Path $LocalProps)) {
    Write-Host "[SETUP] Creo local.properties con SDK path..." -ForegroundColor Yellow
    [IO.File]::WriteAllText($LocalProps, "sdk.dir=C\:\\Users\\princ\\AppData\\Local\\Android\\Sdk`n")
}

#-- Config validation
if ($Mode -eq "prod") {
    if (-not (Test-Path $CapConfigProd)) {
        Write-Host "[ERROR] capacitor.config.prod.ts non trovato." -ForegroundColor Red
        exit 1
    }
    $cfgProd = Get-Content $CapConfigProd -Raw
    if ($cfgProd -match "server\s*:\s*\{[\s\S]*?url\s*:") {
        Write-Host "[ERROR] Mode prod richiede UI locale: server.url NON consentita in capacitor.config.prod.ts." -ForegroundColor Red
        exit 1
    }
    Write-Host "[CONFIG] Modalita' PROD: UI locale da dist/." -ForegroundColor Green
} else {
    if (-not (Test-Path $CapConfigMain)) {
        Write-Host "[ERROR] capacitor.config.ts non trovato." -ForegroundColor Red
        exit 1
    }
    $cfg = Get-Content $CapConfigMain -Raw
    if ($cfg -notmatch "server\s*:\s*\{[\s\S]*?url\s*:") {
        Write-Host "[ERROR] Mode lovable richiede server.url reale in capacitor.config.ts." -ForegroundColor Red
        Write-Host "        Nessuna server.url trovata: evita APK con UI stale/non deterministica." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[CONFIG] Modalita' LOVABLE: server.url rilevata in capacitor.config.ts." -ForegroundColor Magenta
}

#-- Lockfile policy (single source of truth)
if (-not (Test-Path $PackageLock)) {
    Write-Host "[ERROR] package-lock.json mancante: build npm non deterministica." -ForegroundColor Red
    Write-Host "        Esegui npm install per rigenerare package-lock.json prima della build." -ForegroundColor Yellow
    exit 1
}
if ((Test-Path $BunLock) -or (Test-Path $BunLockBin)) {
    Write-Host "[LOCKFILE] Rilevato lockfile bun (bun.lock/bun.lockb)." -ForegroundColor Yellow
    Write-Host "[LOCKFILE] Autorita' build: package-lock.json (npm). Bun lockfile non usato da questo script." -ForegroundColor Yellow
}

Push-Location $ProjectRoot
try {
    #-- Build always: APK must include a fresh dist bundle before cap sync.
    Write-Host "[BUILD] npm run build..." -ForegroundColor Yellow
    cmd /c "npm run build 2>&1" | Select-Object -Last 8
    if ($LASTEXITCODE -ne 0) { throw "npm build failed" }

    #-- cap sync
    Write-Host "[SYNC] npx cap sync android..." -ForegroundColor Yellow
    cmd /c "npx cap sync android 2>&1" | Select-Object -Last 8
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }

    #-- Gradle
    Write-Host "[GRADLE] assembleRelease..." -ForegroundColor Yellow
    Push-Location $AndroidDir
    .\gradlew.bat assembleRelease 2>&1 | Select-Object -Last 10
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }
    Pop-Location

    #-- Sign APK
    Write-Host "[SIGN] zipalign + apksigner (debug keystore)..." -ForegroundColor Yellow
    $apkUnsigned = Join-Path $ApkDir "app-release-unsigned.apk"
    $apkAligned  = Join-Path $ApkDir "app-release-aligned.apk"
    $apkSigned   = Join-Path $ApkDir "app-release-signed.apk"

    & $ZipAlign -f 4 $apkUnsigned $apkAligned
    & $ApkSigner sign --ks $DebugKs --ks-key-alias androiddebugkey `
        --ks-pass pass:android --key-pass pass:android `
        --out $apkSigned $apkAligned

    if (-not (Test-Path $apkSigned)) { throw "APK firmato non trovato" }

    #-- Install
    if (-not $SkipInstall) {
        Write-Host "[INSTALL] adb install..." -ForegroundColor Yellow
        & $AdbExe install -r $apkSigned
        if ($LASTEXITCODE -ne 0) { throw "adb install failed" }
    } else {
        Write-Host "[SKIP] Install saltato (-SkipInstall)" -ForegroundColor DarkGray
        Write-Host "  APK: $apkSigned" -ForegroundColor White
    }

    #-- Done
    Write-Host ""
    Write-Host "=== DONE ===" -ForegroundColor Green
    if ($Mode -eq "prod") {
        Write-Host "  APK installato in modalita' PRODUZIONE." -ForegroundColor Green
        Write-Host "  UI caricata da file locali (dist/)." -ForegroundColor Green
    } else {
        Write-Host "  APK installato in modalita' LOVABLE." -ForegroundColor Magenta
        Write-Host "  server.url remoto attivo da capacitor.config.ts." -ForegroundColor Magenta
    }
    Write-Host "  Backend via client.ts (USB/LAN/Tailscale)." -ForegroundColor White
} finally {
    Pop-Location
}

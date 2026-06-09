#Requires -RunAsAdministrator
# Установка русского голоса System.Speech (как на Android TTS / Windows Narrator).
# Запуск: ПКМ → «Запуск от имени администратора» или:
#   powershell -ExecutionPolicy Bypass -File backend/scripts/install-windows-ru-speech.ps1
$ErrorActionPreference = 'Stop'

Write-Host '[install-ru-speech] Installing ru-RU language + speech...'

try {
  Install-Language ru-RU -CopyToSettings -ErrorAction Stop
  Write-Host '[install-ru-speech] Install-Language ok'
} catch {
  Write-Warning "Install-Language: $($_.Exception.Message)"
}

$caps = Get-WindowsCapability -Online | Where-Object { $_.Name -match 'Speech.*ru-RU|ru-RU.*Speech' -and $_.State -ne 'Installed' }
foreach ($cap in $caps) {
  Write-Host "[install-ru-speech] Adding $($cap.Name)..."
  Add-WindowsCapability -Online -Name $cap.Name
}

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$ru = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'ru-RU' }
if ($ru) {
  Write-Host "[install-ru-speech] OK: $($ru.VoiceInfo.Name)"
} else {
  Write-Error 'Русский голос не появился. Параметры → Время и язык → Речь → добавьте русский голос вручную.'
}

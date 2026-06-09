# Demo WAVs via Windows System.Speech (близко к Android TTS на русской локали).
# Run: powershell -ExecutionPolicy Bypass -File backend/scripts/demo-android-tts.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$outDir = Join-Path $root 'demo-audio'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$date = Get-Date -Format 'yyyy-MM-dd'

$samples = @(
  @{
    id = '01-ratm-christmas'
    namesOn = 'Killing in The Name by Rage Against The Machine неожиданно возглавил британский рождественский чарт в две тысячи девятом. Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.'
    namesOff = 'Этот хит неожиданно возглавил британский рождественский чарт в две тысячи девятом. Фанаты устроили кампанию в интернете, чтобы вытеснить попсу из топов — и у них получилось.'
  },
  @{
    id = '02-thriller-mtv'
    namesOn = 'Thriller by Michael Jackson вышел, когда клипы только меняли правила игры. МТВ крутил в основном рок, но Thriller ставили в эфир целиком. Исполнитель вложил полмиллиона долларов из своего кармана.'
    namesOff = 'Эта песня вышла, когда клипы только меняли правила игры. МТВ крутил в основном рок, но её крутили в эфир без нарезки. Исполнитель вложил полмиллиона долларов из своего кармана.'
  },
  @{
    id = '03-rhcp-snow'
    namesOn = 'Snow by Red Hot Chili Peppers — гитарный рифф с альбома две тысячи шестого года. В начале две тысячи седьмого его крутили на повторе.'
    namesOff = 'Этот хит держится на гитарном рифе с альбома две тысячи шестого года. В начале две тысячи седьмого его крутили на повторе по всем станциям.'
  }
)

function Get-RuVoice {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $ru = [System.Globalization.CultureInfo]::GetCultureInfo('ru-RU')
  foreach ($v in $synth.GetInstalledVoices()) {
    if ($v.VoiceInfo.Culture.Name -eq $ru.Name) { return $v.VoiceInfo.Name }
  }
  return $null
}

$voiceName = Get-RuVoice
if (-not $voiceName) {
  Write-Warning 'Русский голос System.Speech не найден — WAV не сгенерированы. Тексты: demo-audio/android-tts-scripts.txt. На телефоне: Настройки → Озвучка → Android TTS.'
  exit 0
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($voiceName)
$synth.Rate = 0
$synth.Volume = 100

foreach ($sample in $samples) {
  foreach ($mode in @('names-on', 'names-off')) {
    $text = if ($mode -eq 'names-on') { $sample.namesOn } else { $sample.namesOff }
    $file = Join-Path $outDir "${date}_$($sample.id)_android-tts_${mode}.wav"
    $synth.SetOutputToWaveFile($file)
    $synth.Speak($text)
    $synth.SetOutputToDefaultAudioDevice()
    Write-Host "[android-tts] $file"
  }
}

Write-Host "done -> $outDir (voice: $voiceName)"

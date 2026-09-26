$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "WellracomCRM\ThunderbirdHelper"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$handlerUrl = "https://crmsales.up.railway.app/thunderbird-helper/open-crm-email.ps1"
$handlerPath = Join-Path $installDir "open-crm-email.ps1"
Invoke-WebRequest -UseBasicParsing -Uri $handlerUrl -OutFile $handlerPath

$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$handlerPath`" `"%1`""
New-Item -Path "HKCU:\Software\Classes\wellracomcrm" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\wellracomcrm" -Name "(Default)" -Value "URL:Wellracom CRM Thunderbird"
Set-ItemProperty -Path "HKCU:\Software\Classes\wellracomcrm" -Name "URL Protocol" -Value ""

New-Item -Path "HKCU:\Software\Classes\wellracomcrm\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\wellracomcrm\shell\open\command" -Name "(Default)" -Value $command

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
  "Thunderbird Helper berhasil dipasang.`n`nSilakan kembali ke CRM dan klik 'Buka Thunderbird + PDF'.",
  "Wellracom CRM",
  "OK",
  "Information"
) | Out-Null
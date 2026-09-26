param(
  [Parameter(Mandatory=$true)]
  [string]$ProtocolUrl
)

$ErrorActionPreference = "Stop"
$BaseUrl = "https://crmsales.my.id"

try {
  $uri = [System.Uri]$ProtocolUrl
  Add-Type -AssemblyName System.Web
  $query = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
  $token = $query.Get("token")
  if ([string]::IsNullOrWhiteSpace($token)) { throw "Token CRM tidak ditemukan." }

  $package = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/quotations/desktop-email/$token"
  $tempDir = Join-Path $env:TEMP "WellracomCRM"
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

  $safeNumber = ($package.quotation_number -replace '[^a-zA-Z0-9_-]', '_')
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss_fff"
  $pdfPath = Join-Path $tempDir ("Quotation_" + $safeNumber + "_" + $stamp + ".pdf")
  # Prevent any client/proxy cache from returning an older PDF with the same filename.
  $pdfUrl = "$BaseUrl$($package.pdf_url)"
  if ($pdfUrl.Contains("?")) { $pdfUrl += "&_ts=$stamp" } else { $pdfUrl += "?_ts=$stamp" }
  Invoke-WebRequest -UseBasicParsing -Uri $pdfUrl -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" } -OutFile $pdfPath
  if (-not (Test-Path $pdfPath)) { throw "PDF quotation gagal diunduh." }
  if ((Get-Item $pdfPath).Length -le 0) { throw "PDF quotation kosong." }

  $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  $candidates = @(
    (Join-Path $env:ProgramFiles "Mozilla Thunderbird\thunderbird.exe"),
    (Join-Path $programFilesX86 "Mozilla Thunderbird\thunderbird.exe"),
    (Join-Path $env:LOCALAPPDATA "Mozilla Thunderbird\thunderbird.exe")
  ) | Where-Object { $_ -and (Test-Path $_) }

  $thunderbird = $candidates | Select-Object -First 1
  if (-not $thunderbird) { throw "Mozilla Thunderbird tidak ditemukan. Install Thunderbird terlebih dahulu." }

  $body = [string]$package.body
  $body = $body.Replace("'", "''")
  $subject = ([string]$package.subject).Replace("'", "''")
  $to = ([string]$package.to).Replace("'", "''")
  $cc = ([string]$package.cc).Replace("'", "''")

  # Thunderbird's -compose parser accepts a normal Windows file path for attachment.
  # Pass the complete compose payload as ONE argument to avoid Windows argument splitting.
  $attachmentPath = $pdfPath.Replace("'", "''")
  # Thunderbird expects a file URI for reliable attachment handling on current Windows builds.
  $attachmentUri = ([System.Uri]::new($pdfPath)).AbsoluteUri
  $compose = "to='$to',subject='$subject',body='$body',attachment='$attachmentUri'"
  if (-not [string]::IsNullOrWhiteSpace($cc)) {
    $compose = "to='$to',cc='$cc',subject='$subject',body='$body',attachment='$attachmentUri'"
  }

  & $thunderbird "-compose" $compose

}
catch {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "Wellracom CRM Thunderbird Helper`n`n$($_.Exception.Message)",
    "Wellracom CRM",
    "OK",
    "Error"
  ) | Out-Null
}
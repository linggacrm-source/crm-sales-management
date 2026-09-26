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
  # Download the PDF as raw binary with curl.exe for maximum compatibility on Windows.
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { throw "curl.exe tidak ditemukan di Windows." }
  & $curl.Source --fail --silent --show-error --location --header "Cache-Control: no-cache" --header "Pragma: no-cache" --output $pdfPath $pdfUrl
  if ($LASTEXITCODE -ne 0) { throw "PDF quotation gagal diunduh (HTTP/curl error $LASTEXITCODE)." }
  if (-not (Test-Path $pdfPath)) { throw "PDF quotation gagal diunduh." }

  $pdfBytes = [System.IO.File]::ReadAllBytes($pdfPath)
  if ($pdfBytes.Length -lt 20) { throw "PDF quotation terlalu kecil/kosong." }
  $header = [System.Text.Encoding]::ASCII.GetString($pdfBytes, 0, 4)
  if ($header -ne "%PDF") { throw "File attachment yang diterima bukan PDF yang valid." }
  $tailStart = [Math]::Max(0, $pdfBytes.Length - 1024)
  $tail = [System.Text.Encoding]::ASCII.GetString($pdfBytes, $tailStart, $pdfBytes.Length - $tailStart)
  if ($tail -notmatch "%%EOF") { throw "PDF quotation tidak memiliki trailer EOF yang valid." }

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
  $compose = "to='$to',subject='$subject',body='$body',attachment='$attachmentPath'"
  if (-not [string]::IsNullOrWhiteSpace($cc)) {
    $compose = "to='$to',cc='$cc',subject='$subject',body='$body',attachment='$attachmentPath'"
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
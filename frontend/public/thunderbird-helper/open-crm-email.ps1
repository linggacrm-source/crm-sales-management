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
  # Download the PDF directly as bytes. HttpClient avoids PowerShell/curl
  # content handling differences and preserves the PDF byte-for-byte.
  $http = [System.Net.Http.HttpClient]::new()
  try {
    $http.DefaultRequestHeaders.TryAddWithoutValidation("Cache-Control", "no-cache") | Out-Null
    $http.DefaultRequestHeaders.TryAddWithoutValidation("Pragma", "no-cache") | Out-Null
    $response = $http.GetAsync($pdfUrl).GetAwaiter().GetResult()
    $pdfBytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw "PDF quotation gagal diunduh (HTTP $([int]$response.StatusCode))."
    }
  }
  finally {
    $http.Dispose()
  }

  if ($pdfBytes.Length -lt 20) { throw "PDF quotation terlalu kecil/kosong." }
  $header = [System.Text.Encoding]::ASCII.GetString($pdfBytes, 0, 4)
  if ($header -ne "%PDF") { throw "File attachment yang diterima bukan PDF yang valid." }
  $tailStart = [Math]::Max(0, $pdfBytes.Length - 1024)
  $tail = [System.Text.Encoding]::ASCII.GetString($pdfBytes, $tailStart, $pdfBytes.Length - $tailStart)
  if ($tail -notmatch "%%EOF") { throw "PDF quotation tidak memiliki trailer EOF yang valid." }

  [System.IO.File]::WriteAllBytes($pdfPath, $pdfBytes)
  if (-not (Test-Path $pdfPath)) { throw "PDF quotation gagal disimpan." }

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
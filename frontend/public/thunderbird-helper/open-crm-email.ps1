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
  # Download the PDF through a raw HTTP response stream. This is compatible
  # with Windows PowerShell 5.1 and avoids buffering/encoding transformations.
  $request = [System.Net.WebRequest]::Create($pdfUrl)
  $request.Method = "GET"
  $request.Headers["Cache-Control"] = "no-cache"
  $request.Headers["Pragma"] = "no-cache"
  $response = $null
  $inputStream = $null
  $outputStream = $null
  try {
    $response = $request.GetResponse()
    if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) {
      throw "HTTP $([int]$response.StatusCode)"
    }

    $inputStream = $response.GetResponseStream()
    $outputStream = [System.IO.File]::Open($pdfPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $inputStream.CopyTo($outputStream)
  }
  catch {
    throw "PDF quotation gagal diunduh: $($_.Exception.Message)"
  }
  finally {
    if ($outputStream) { $outputStream.Dispose() }
    if ($inputStream) { $inputStream.Dispose() }
    if ($response) { $response.Dispose() }
  }

  if (-not (Test-Path $pdfPath)) { throw "PDF quotation gagal disimpan." }
  $pdfFile = Get-Item $pdfPath
  if ($pdfFile.Length -lt 20) { throw "Server mengirim PDF kosong/terpotong (ukuran $($pdfFile.Length) byte)." }

  $headerBytes = New-Object byte[] 4
  $fileStream = [System.IO.File]::OpenRead($pdfPath)
  try {
    [void]$fileStream.Read($headerBytes, 0, 4)
  }
  finally {
    $fileStream.Dispose()
  }
  $header = [System.Text.Encoding]::ASCII.GetString($headerBytes)
  if ($header -ne "%PDF") { throw "Server tidak mengirim file PDF yang valid." }

  $tailStart = [Math]::Max(0, $pdfFile.Length - 1024)
  $fileBytes = [System.IO.File]::ReadAllBytes($pdfPath)
  $tail = [System.Text.Encoding]::ASCII.GetString($fileBytes, $tailStart, $fileBytes.Length - $tailStart)
  if ($tail -notmatch "%%EOF") { throw "PDF quotation terpotong: trailer EOF tidak ditemukan." }

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
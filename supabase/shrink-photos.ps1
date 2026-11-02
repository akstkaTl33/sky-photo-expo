# 이미 올린 사진을 줄인다: 큰 그림 1200px, 작은 그림 480px을 새로 올리고 작품 줄의 img·thumb를 바꾼다.
# thumb가 이미 있는 작품은 건너뛰므로 여러 번 실행해도 괜찮다. 원본 파일은 저장소에 그대로 남는다.
#   먼저 한 점만:  powershell -File shrink-photos.ps1 -Limit 1
#   나머지 전부:   powershell -File shrink-photos.ps1
#   그림 줄이기만 시험: powershell -File shrink-photos.ps1 -TestFile <그림 경로>
param([int]$Limit = 0, [string]$TestFile = "", [string]$WorkDir = "$env:TEMP\sky-shrink")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$Url = "https://kyqmjecjjlhgzuozpoxp.supabase.co"
$Key = "sb_publishable_AJm51RRf8b_aeujsfDcaow_g4KY09gb"
$Bucket = "expo-photos"
New-Item -ItemType Directory -Force $WorkDir | Out-Null
$Jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }

function Shrink([string]$src, [string]$dst, [int]$max, [long]$quality) {
  $im = [System.Drawing.Image]::FromFile($src)
  try {
    $k = [Math]::Min(1.0, $max / [Math]::Max($im.Width, $im.Height))
    $w = [int][Math]::Round($im.Width * $k); $h = [int][Math]::Round($im.Height * $k)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($im, 0, 0, $w, $h)
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), $quality
    $bmp.Save($dst, $Jpeg, $ep)
    $g.Dispose(); $bmp.Dispose()
  } finally { $im.Dispose() }
}

if ($TestFile) {
  foreach ($s in @(@(1200, 80, "full"), @(480, 72, "thumb"))) {
    $out = Join-Path $WorkDir "test-$($s[2]).jpg"
    Shrink $TestFile $out $s[0] $s[1]
    $i = [System.Drawing.Image]::FromFile($out)
    "$($s[2]): $($i.Width)x$($i.Height), $([int]((Get-Item $out).Length / 1024)) KB"
    $i.Dispose()
  }
  return
}

function Upload([string]$file) {
  $name = "photos/$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$([guid]::NewGuid().ToString('N').Substring(0, 6)).jpg"
  $code = & curl.exe -s -o "$WorkDir\up.txt" -w "%{http_code}" -X POST -H "apikey: $Key" -H "Content-Type: image/jpeg" -H "Cache-Control: max-age=31536000" --data-binary "@$file" "$Url/storage/v1/object/$Bucket/$name"
  if ($code -ne "200") { throw "upload failed ($code): $(Get-Content -Raw "$WorkDir\up.txt")" }
  "$Url/storage/v1/object/public/$Bucket/$name"
}

# 파일로 받아 UTF-8로 읽는다 (PowerShell 5.1의 웹 응답 해석이 한글 제목을 깨뜨리지 않게).
$rowsFile = Join-Path $WorkDir "rows-backup-$(Get-Date -Format yyyyMMdd-HHmmss).json"
$code = & curl.exe -s -o $rowsFile -w "%{http_code}" -H "apikey: $Key" "$Url/rest/v1/expo_content?select=id,data&id=like.sky3-p-1*"
if ($code -ne "200") { throw "저장소가 아직 막혀 있어요 (HTTP $code)" }
$rows = Get-Content -Raw -Encoding UTF8 $rowsFile | ConvertFrom-Json
$todo = @($rows | Where-Object { -not $_.data.thumb -and $_.data.img })
"작품 $($rows.Count)점 중 줄일 것 $($todo.Count)점. 백업: $rowsFile"
if ($Limit -gt 0) { $todo = @($todo | Select-Object -First $Limit) }

$before = 0L; $after = 0L; $n = 0
foreach ($r in $todo) {
  $orig = Join-Path $WorkDir "orig.jpg"; $full = Join-Path $WorkDir "full.jpg"; $thumb = Join-Path $WorkDir "thumb.jpg"
  $code = & curl.exe -s -o $orig -w "%{http_code}" $r.data.img
  if ($code -ne "200") { "건너뜀 $($r.id): 사진을 못 받음 ($code)"; continue }
  Shrink $orig $full 1200 80
  Shrink $orig $thumb 480 72
  # 줄인 것이 원래보다 크면 원래 그림을 그대로 둔다.
  $keep = (Get-Item $full).Length -ge (Get-Item $orig).Length
  $data = $r.data
  $thumbUrl = Upload $thumb
  if (-not $keep) { $data.img = Upload $full }
  $data | Add-Member -NotePropertyName thumb -NotePropertyValue $thumbUrl -Force
  $body = Join-Path $WorkDir "body.json"
  $json = (@{ data = $data } | ConvertTo-Json -Depth 8 -Compress)
  [IO.File]::WriteAllText($body, $json, (New-Object Text.UTF8Encoding $false))
  $code = & curl.exe -s -o "$WorkDir\patch.txt" -w "%{http_code}" -X PATCH -H "apikey: $Key" -H "Content-Type: application/json; charset=utf-8" --data-binary "@$body" "$Url/rest/v1/expo_content?id=eq.$($r.id)"
  if ($code -notmatch "^20") { throw "row update failed ($code) $($r.id): $(Get-Content -Raw "$WorkDir\patch.txt")" }
  $before += (Get-Item $orig).Length
  $after += $(if ($keep) { (Get-Item $orig).Length } else { (Get-Item $full).Length })
  $n++
  "$n / $($todo.Count): $($r.id) $([int]((Get-Item $orig).Length / 1024)) KB -> $([int]((Get-Item $full).Length / 1024)) KB, 작은 그림 $([int]((Get-Item $thumb).Length / 1024)) KB"
}
"끝: $n 점, 큰 그림 합계 $([int]($before / 1024)) KB -> $([int]($after / 1024)) KB"

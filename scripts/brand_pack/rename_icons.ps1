param(
  [Parameter(Mandatory=$true)][string]$Src
)
$outDir = "public/brand/icons/neon"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$files = Get-ChildItem $Src -File | Sort-Object Name
$i = 1
foreach ($f in $files) {
  $id = "{0:D3}" -f $i
  $target = Join-Path $outDir ("vi-" + $id + $f.Extension.ToLower())
  Copy-Item $f.FullName $target -Force
  $i++
}
Write-Host ("Copied " + ($i-1) + " files to " + $outDir)

Param(
  [string]$Base = "http://localhost:3001/v1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) ("selftest-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmpDir | Out-Null

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    [switch]$Json
  )
  $uri = "$Base$Path"
  if ($Json -and $Body) {
    $payload = $Body | ConvertTo-Json -Depth 6
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $script:Headers -Body $payload -ContentType "application/json"
  }
  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $script:Headers -Body $Body
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $script:Headers
}

function Upload-File {
  param([string]$Path)
  $form = @{ file = Get-Item -LiteralPath $Path }
  return Invoke-RestMethod -Method Post -Uri "$Base/uploads" -Headers $script:Headers -Form $form
}

function Wait-ForTask {
  param([string]$TaskId)
  for ($i = 0; $i -lt 120; $i++) {
    $task = Invoke-Api -Method GET -Path "/tasks/$TaskId"
    if ($task.status -in @('success', 'failed', 'cancelled')) {
      return $task
    }
    Start-Sleep -Seconds 2
  }
  throw "Timeout waiting for task $TaskId"
}

try {
  Write-Host "[selftest] Health check"
  Invoke-RestMethod -Method Get -Uri "$Base/healthz" | Out-Null

  $wavBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAAAA'
  $mp4Base64 = 'AAAAHGZ0eXBpc29tAAAAAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAIABtZGF0AAACrAAAACBoZWFkAAAAHgAAABQAAABIAAAAAQAAAFQAAAAyAAAAFgAAABoAAAAwAAAAKgAAAC4AAABfZGF0YQAAAAE='
  $wavPath = Join-Path $tmpDir 'selftest.wav'
  $mp4Path = Join-Path $tmpDir 'selftest.mp4'
  [IO.File]::WriteAllBytes($wavPath, [Convert]::FromBase64String($wavBase64))
  [IO.File]::WriteAllBytes($mp4Path, [Convert]::FromBase64String($mp4Base64))

  $email = "selftest+$([DateTime]::UtcNow.ToString('yyyyMMddHHmmssfff'))@codex.local"
  $password = "Passw0rd!123!"
  $registerBody = @{ email = $email; password = $password } | ConvertTo-Json
  $register = Invoke-RestMethod -Method Post -Uri "$Base/auth/register" -Body $registerBody -ContentType "application/json"
  $token = $register.token
  if (-not $token) { throw "Token missing from register response" }
  $orgId = $register.organizations[0].organizationId
  if (-not $orgId) { throw "Organization missing from register response" }
  $script:Headers = @{
    Authorization = "Bearer $token"
    'X-Org-Id'     = $orgId
  }

  Write-Host "[selftest] Upload sample WAV"
  $audioUpload = Upload-File -Path $wavPath
  Write-Host "[selftest] Upload sample MP4"
  $videoUpload = Upload-File -Path $mp4Path

  $yamlTemplate = @"
stages:
  - id: sub
    title: SelfTest Subtitle
    params:
      kind: subtitle
      language: en-US
      inputAudio: "$($audioUpload.storage.path)"
  - id: dub
    title: SelfTest Dub
    dependsOn: [sub]
    params:
      kind: dubbing
      provider: mock
      language: en-US
      inputSubtitle:
        from: sub
        artifact: srt
  - id: burn
    title: SelfTest Burn
    dependsOn: [sub, dub]
    params:
      kind: burn
      inputVideo: "$($videoUpload.storage.path)"
      inputAudio:
        from: dub
        artifact: tts_wav
      inputSubtitle:
        from: sub
        artifact: srt
      preset: 1080p:h264:auto
"@

  Write-Host "[selftest] Run pipeline template"
  $pipelineResponse = Invoke-Api -Method POST -Path "/pipeline/run" -Body @{ template = $yamlTemplate } -Json
  $burnStage = $pipelineResponse.created | Where-Object { $_.stageId -eq 'burn' }
  if (-not $burnStage) {
    throw "Burn stage not returned"
  }
  $burnTaskId = $burnStage.taskId

  Write-Host "[selftest] Waiting for burn task $burnTaskId"
  $burnTask = Wait-ForTask -TaskId $burnTaskId
  if ($burnTask.status -ne 'success') {
    throw "Burn task ended with status $($burnTask.status)"
  }

  $artifactPath = Join-Path (Resolve-Path .) ("workspace/$burnTaskId/artifacts.json")
  if (-not (Test-Path $artifactPath)) {
    throw "Artifacts file not found: $artifactPath"
  }
  $artifactData = Get-Content $artifactPath -Raw | ConvertFrom-Json
  if (-not $artifactData.artifacts.video) {
    throw "Video artifact missing in artifacts.json"
  }

  Write-Host "PASS"
  exit 0
}
catch {
  Write-Error $_
  exit 1
}
finally {
  if (Test-Path $tmpDir) {
    Remove-Item -Recurse -Force $tmpDir
  }
}

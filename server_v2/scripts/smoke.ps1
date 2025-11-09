Param(
  [string]$Base = $(if ($env:BASE) { $env:BASE } else { "http://localhost:3001" }),
  [string]$Workspace = $(if ($env:WORK_DIR) { $env:WORK_DIR } else { "./workspace" }),
  [int]$EventTimeout = $(if ($env:EVENT_TIMEOUT) { [int]$env:EVENT_TIMEOUT } else { 6 }),
  [int]$PollInterval = $(if ($env:POLL_INTERVAL) { [int]$env:POLL_INTERVAL } else { 1 })
)

$ErrorActionPreference = "Stop"

function Write-SmokeLog {
  param([string]$Message)
  Write-Host "[smoke] $Message"
}

function Invoke-SmokeRequest {
  param(
    [ValidateSet("GET", "POST", "PATCH")]
    [string]$Method,
    [string]$Path,
    [object]$Body
  )

  $uri = "$Base$Path"
  $parameters = @{
    Method = $Method
    Uri    = $uri
    Headers = @{
      "Content-Type" = "application/json"
    }
  }

  if ($null -ne $Body) {
    $parameters.Body = ($Body | ConvertTo-Json -Depth 6)
  }

  return Invoke-RestMethod @parameters
}

function Watch-Events {
  param(
    [string]$TaskId,
    [string]$Label
  )
  Write-SmokeLog "Watching /events for $Label ($TaskId)"
  $args = @("--no-buffer", "--silent", "--max-time", $EventTimeout, "$Base/events?taskId=$TaskId")
  & curl.exe @args 2>$null | Out-String | ForEach-Object { $_.TrimEnd() | ForEach-Object { if ($_ -ne "") { Write-Host $_ } } }
  $code = $LASTEXITCODE
  if ($code -ne 0 -and $code -ne 28) {
    throw "curl exited with code $code while streaming events"
  }
}

function Wait-Task {
  param(
    [string]$TaskId,
    [string]$Label
  )

  while ($true) {
    $task = Invoke-SmokeRequest -Method "GET" -Path "/tasks/$TaskId" -Body $null
    $status = "$($task.status)"
    if ($status -eq "success") {
      Write-SmokeLog "$Label ($TaskId) completed"
      return $task
    }
    if ($status -eq "failed" -or $status -eq "cancelled") {
      throw "$Label ($TaskId) ended with status $status"
    }
    Start-Sleep -Seconds $PollInterval
  }
}

function Show-Artifacts {
  param(
    [string]$TaskId,
    [string]$Label
  )

  $folder = Join-Path -Path $Workspace -ChildPath $TaskId
  $file = Join-Path -Path $folder -ChildPath "artifacts.json"
  if (Test-Path -LiteralPath $file) {
    Write-SmokeLog "Artifacts for $Label ($TaskId) -> $file"
    Get-Content -LiteralPath $file | Write-Host
  } else {
    Write-SmokeLog "Artifacts file missing for $Label ($TaskId) at $file"
  }
}

Write-SmokeLog "Creating subtitle task (A)"
$subtitlePayload = @{
  title  = "Smoke Subtitle"
  params = @{
    kind       = "subtitle"
    language   = "en-US"
    inputAudio = "./sample.wav"
  }
}
$subtitle = Invoke-SmokeRequest -Method "POST" -Path "/tasks" -Body $subtitlePayload
$subtitleId = $subtitle.id
Write-SmokeLog "Subtitle task id: $subtitleId"
Watch-Events -TaskId $subtitleId -Label "subtitle"
Wait-Task -TaskId $subtitleId -Label "subtitle" | Out-Null

Write-SmokeLog "Creating dubbing task (B)"
$dubbingPayload = @{
  title     = "Smoke Dubbing"
  dependsOn = @($subtitleId)
  params    = @{
    kind          = "dubbing"
    provider      = "mock"
    language      = "en-US"
    inputSubtitle = @{
      from     = $subtitleId
      artifact = "srt"
    }
  }
}
$dubbing = Invoke-SmokeRequest -Method "POST" -Path "/tasks" -Body $dubbingPayload
$dubbingId = $dubbing.id
Write-SmokeLog "Dubbing task id: $dubbingId"
Watch-Events -TaskId $dubbingId -Label "dubbing"
Wait-Task -TaskId $dubbingId -Label "dubbing" | Out-Null

Write-SmokeLog "Creating burn task (C)"
$burnPayload = @{
  title     = "Smoke Burn"
  dependsOn = @($subtitleId, $dubbingId)
  params    = @{
    kind          = "burn"
    inputVideo    = "./sample.mp4"
    inputAudio    = @{
      from     = $dubbingId
      artifact = "tts_wav"
    }
    inputSubtitle = @{
      from     = $subtitleId
      artifact = "srt"
    }
    resolution    = "1920x1080"
    codec         = "libx264"
    container     = "mp4"
  }
}
$burn = Invoke-SmokeRequest -Method "POST" -Path "/tasks" -Body $burnPayload
$burnId = $burn.id
Write-SmokeLog "Burn task id: $burnId"
Watch-Events -TaskId $burnId -Label "burn"
Wait-Task -TaskId $burnId -Label "burn" | Out-Null

Show-Artifacts -TaskId $subtitleId -Label "subtitle"
Show-Artifacts -TaskId $dubbingId -Label "dubbing"
Show-Artifacts -TaskId $burnId -Label "burn"

Write-SmokeLog "Smoke flow complete 🎬"

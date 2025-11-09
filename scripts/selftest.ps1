#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'
if (-not $env:DEV_TOOLS) {
  $env:DEV_TOOLS = 'true'
}
$env:SELFTEST_ENABLE_EXTERNAL = $env:SELFTEST_ENABLE_EXTERNAL ?? 'false'

Set-Location server_v2
npx --yes tsx ../scripts/selftest-runner.ts

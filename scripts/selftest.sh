#!/usr/bin/env bash
set -euo pipefail

export SELFTEST_ENABLE_EXTERNAL=${SELFTEST_ENABLE_EXTERNAL:-false}
export DEV_TOOLS=true

cd server_v2
npx --yes tsx ../scripts/selftest-runner.ts

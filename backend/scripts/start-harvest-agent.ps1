# Harvest dashboard — local start button backend
# PowerShell: Set-Location "...\Music story\backend"; .\scripts\start-harvest-agent.ps1
$ErrorActionPreference = 'Stop'
$Backend = Split-Path $PSScriptRoot -Parent
Set-Location $Backend
npm run seed:agent

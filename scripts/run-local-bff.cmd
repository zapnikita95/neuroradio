@echo off
setlocal EnableExtensions
cd /d "%~dp0..\backend"

set "LLM_PROVIDER=local"
set "PORT=3000"
set "NODE_ENV=development"
set "LOCAL_OLLAMA_BASE_URL=http://127.0.0.1:11435"
set "LOCAL_OLLAMA_MODEL=qwen3.6:35b-a3b-q4_K_M"
set "LOCAL_LOG_FILE=%~dp0..\logs\local-bff.log"

echo ===== START %date% %time% =====>>"%LOCAL_LOG_FILE%"
node dist\index.js >>"%LOCAL_LOG_FILE%" 2>&1
echo ===== EXIT %ERRORLEVEL% %date% %time% =====>>"%LOCAL_LOG_FILE%"

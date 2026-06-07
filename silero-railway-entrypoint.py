"""Railway entrypoint: bind Silero on $PORT (Railway healthcheck)."""
import os
import sys

ROOT = '/usr/app'
os.chdir(ROOT)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import uvicorn

from app.logger import LogConfig
from main import get_application

port = int(os.environ.get('PORT', '9898'))
print(f'[silero-railway] listening on 0.0.0.0:{port}', flush=True)
uvicorn.run(get_application(), host='0.0.0.0', port=port, log_config=LogConfig().dict())

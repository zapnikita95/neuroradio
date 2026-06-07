"""Railway entrypoint: bind Silero on $PORT (Railway healthcheck)."""
import os

import uvicorn

from app.logger import LogConfig
from main import get_application

port = int(os.environ.get('PORT', '9898'))
uvicorn.run(get_application(), host='0.0.0.0', port=port, log_config=LogConfig().dict())

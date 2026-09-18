"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import AsyncMongoClient

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncMongoClient(mongo_url)
db = client[os.environ["DB_NAME"]]

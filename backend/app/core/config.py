import os
from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "Mule Matrix"
    VERSION: str = "1.0.0"
    ENV: str = "development"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "sqlite:///./mule_matrix.db"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Detection Engine Defaults
    DETECTOR_VERSION: str = "v2_candidate_matrix"
    PASS_THROUGH_RATIO_THRESHOLD: float = 0.85
    PASS_THROUGH_WINDOW_MINUTES: int = 60
    VELOCITY_BURST_COUNT: int = 5
    VELOCITY_BURST_WINDOW_MINUTES: int = 30
    FAN_IN_MIN_COUNTERPARTIES: int = 4
    FAN_OUT_MIN_COUNTERPARTIES: int = 3
    RETENTION_MIN_PCT: float = 0.01
    RETENTION_MAX_PCT: float = 0.15
    RISK_ALERT_THRESHOLD: float = 65.0
    
    # Lineage Engine Defaults
    LOOKBACK_HOURS: int = 72
    LOOKAHEAD_HOURS: int = 72
    MAX_HOPS: int = 12
    MAX_NODES: int = 150
    MAX_EDGES: int = 300
    
    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()

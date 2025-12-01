"""
Local entry point for running the FastAPI server.

Usage: uvicorn main_app:app --reload
"""

from app_factory import create_app

app = create_app()


import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./rupeeocr.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_auth_columns() -> None:
    """Backfill auth columns on older databases without a formal migration tool yet."""
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    with engine.begin() as connection:
        if "password_hash" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR"))
        if "hashed_password" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR"))
        if "password_hash" in user_columns:
            connection.execute(
                text(
                    "UPDATE users SET hashed_password = password_hash "
                    "WHERE hashed_password IS NULL AND password_hash IS NOT NULL"
                )
            )
        if "created_at" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_unique ON users (email)"))


def ensure_receipt_columns() -> None:
    """Backfill receipt columns for local databases created before persistence existed."""
    inspector = inspect(engine)
    if not inspector.has_table("receipts"):
        return

    columns = inspector.get_columns("receipts")
    receipt_columns = {column["name"] for column in columns}
    id_column = next((column for column in columns if column["name"] == "id"), None)
    if engine.dialect.name == "sqlite" and id_column and "INTEGER" in str(id_column["type"]):
        from app.models.models import Receipt

        with engine.begin() as connection:
            connection.execute(text("DROP TABLE receipts"))
        Receipt.__table__.create(bind=engine, checkfirst=True)
        return

    additions = {
        "currency": "VARCHAR DEFAULT 'INR'",
        "date": "DATETIME",
        "category_confidence": "FLOAT DEFAULT 0",
        "ocr_confidence": "FLOAT DEFAULT 0",
        "extraction_method": "VARCHAR DEFAULT 'tesseract'",
        "processing_ms": "INTEGER DEFAULT 0",
        "raw_text": "TEXT DEFAULT ''",
        "file_url": "VARCHAR DEFAULT ''",
        "file_name": "VARCHAR DEFAULT ''",
        "file_content_type": "VARCHAR DEFAULT ''",
        "user_verified": "BOOLEAN DEFAULT 0",
        "gst_json": "TEXT",
    }

    with engine.begin() as connection:
        for column, sql_type in additions.items():
            if column not in receipt_columns:
                connection.execute(text(f"ALTER TABLE receipts ADD COLUMN {column} {sql_type}"))

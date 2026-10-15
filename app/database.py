import os
import sqlite3
from pathlib import Path

# Keeps the database in the backend folder by default. Override with TODO_DB_PATH if needed.
DATABASE_PATH = Path(os.getenv("TODO_DB_PATH", Path(__file__).resolve().parents[1] / "todos.db"))


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
                completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )"""
        )
        # Safe migration for an existing database created by the original app.
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(tasks)")}
        if "created_at" not in columns:
            connection.execute("ALTER TABLE tasks ADD COLUMN created_at TEXT")
            connection.execute("UPDATE tasks SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL")

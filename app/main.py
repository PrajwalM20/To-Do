from contextlib import asynccontextmanager
from pathlib import Path
import sqlite3

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from app.database import get_connection, init_db

BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="TaskFlow API",
    description="A simple, persistent To-Do API built with FastAPI and SQLite.",
    version="2.0.0",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200, examples=["Finish the assignment"])

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Task title cannot be blank")
        return value


class TaskUpdate(BaseModel):
    completed: bool


def serialize_task(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "completed": bool(row["completed"]),
        "created_at": row["created_at"],
    }


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "TaskFlow API"}


@app.get("/api/tasks", tags=["Tasks"])
def get_tasks():
    with get_connection() as connection:
        rows = connection.execute("SELECT * FROM tasks ORDER BY completed ASC, id DESC").fetchall()
    return [serialize_task(row) for row in rows]


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED, tags=["Tasks"])
def create_task(payload: TaskCreate):
    with get_connection() as connection:
        cursor = connection.execute("INSERT INTO tasks (title) VALUES (?)", (payload.title,))
        row = connection.execute("SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return serialize_task(row)


@app.patch("/api/tasks/{task_id}", tags=["Tasks"])
def update_task(task_id: int, payload: TaskUpdate):
    with get_connection() as connection:
        cursor = connection.execute(
            "UPDATE tasks SET completed = ? WHERE id = ?",
            (int(payload.completed), task_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        row = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return serialize_task(row)


@app.delete("/api/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Tasks"])
def delete_task(task_id: int):
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Task not found")
    return None


@app.delete("/api/tasks", tags=["Tasks"])
def clear_completed_tasks():
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM tasks WHERE completed = 1")
    return {"deleted": cursor.rowcount, "message": "Completed tasks cleared"}

import sqlite3
c = sqlite3.connect("todos.db")
c.execute("""
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT
        (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
)
""")
c.commit()
print("Integrity:", c.execute("PRAGMA integrity_check").fetchone()[0])
c.close()

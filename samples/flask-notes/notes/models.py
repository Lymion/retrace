from db import get_db


def list_notes():
    return get_db().execute("SELECT * FROM notes ORDER BY created_at DESC").fetchall()


def add_note(body):
    db = get_db()
    db.execute("INSERT INTO notes (body) VALUES (?)", (body,))
    db.commit()


def delete_note(note_id):
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()

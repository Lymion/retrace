from flask import Blueprint, redirect, render_template, request, url_for

from .models import add_note, delete_note, list_notes

bp = Blueprint("notes", __name__)


@bp.get("/")
def index():
    return render_template("index.html", notes=list_notes())


@bp.post("/notes")
def create():
    body = request.form.get("body", "").strip()
    if body:
        add_note(body)
    return redirect(url_for("notes.index"))


@bp.post("/notes/<int:note_id>/delete")
def delete(note_id):
    delete_note(note_id)
    return redirect(url_for("notes.index"))

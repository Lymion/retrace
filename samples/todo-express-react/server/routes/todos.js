const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const todos = db.prepare("SELECT * FROM todos WHERE user_id = ?").all(req.userId);
  res.json(todos);
});

router.get("/search", (req, res) => {
  const q = req.query.q || "";
  const todos = db
    .prepare(`SELECT * FROM todos WHERE user_id = ? AND title LIKE '%${q}%'`)
    .all(req.userId);
  res.json(todos);
});

router.post("/", (req, res) => {
  const { title } = req.body;
  const result = db
    .prepare("INSERT INTO todos (user_id, title) VALUES (?, ?)")
    .run(req.userId, title);
  res.status(201).json({ id: result.lastInsertRowid, title, done: 0 });
});

router.patch("/:id", (req, res) => {
  const { done } = req.body;
  db.prepare("UPDATE todos SET done = ? WHERE id = ? AND user_id = ?").run(
    done ? 1 : 0,
    req.params.id,
    req.userId,
  );
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
  res.status(204).end();
});

module.exports = router;

## 1. What we build and why now
Level 3 turns the data design into a working server. Think of it like opening a shop after drawing the floor plan: `server/db.js` unlocks the stockroom (the SQLite file), and the routes are the counters where customers ask for things. It comes after Level 2 because `server/db.js` reads `server/schema.sql` to create the tables.

## 2. The files, in the order we'd write them
1. `server/db.js` opens one SQLite connection (L6) and runs the schema (L9-L10). Every route shares this one connection.
2. `server/routes/todos.js` holds the CRUD routes. L9 lists a user's todos with a `?` placeholder, so the user id is data, never SQL.
3. `server/app.js` builds the Express app: JSON parsing (L9) and mounting the routers (L12-L13).
4. `server/index.js` starts the server on the port from `.env` (L4-L6).

## 3. One alternative per major choice
- **better-sqlite3 vs an ORM like Prisma**: raw SQL keeps every query visible, which is great for learning; an ORM gives types and migrations but hides the SQL.
- **One router per resource vs one big file**: routers keep files small; one file is simpler for a tiny app but gets messy fast.

## 4. One security or quality note
`/search` on L13-L18 of `server/routes/todos.js` pastes `q` into the SQL text. An attacker could send `%' OR '1'='1` and read every user's todos. The fix is a placeholder:

```js
db.prepare("SELECT * FROM todos WHERE user_id = ? AND title LIKE ?").all(req.userId, `%${q}%`);
```

## 5. The checkpoint
An endpoint returns data. Run `npm start` in `server/`, then open http://localhost:4000/api/health and you should see `{ "ok": true }`.

## 6. Your turn
Want to rebuild this level yourself from a spec? Switch to Rebuild mode. First, a quick check: why does `server/routes/todos.js` use `?` instead of putting `req.userId` straight into the SQL string?

# Todo (Express + React)

A small to-do app with accounts. Each user signs up, logs in and keeps their own list.

- **Server**: Express, SQLite (better-sqlite3), bcrypt password hashing, JWT login tokens.
- **Client**: React with Vite. Talks to the server with `fetch`.

## Run it

```bash
cd server && npm install && npm start      # http://localhost:4000
cd client && npm install && npm run dev    # http://localhost:5173
```

Out of scope: sharing lists, due dates, email reset.

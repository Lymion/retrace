const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// One connection for the whole server. SQLite is a single file on disk.
const db = new Database(process.env.DATABASE_FILE || "todos.db");

// Create the tables the first time the server starts.
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

module.exports = db;

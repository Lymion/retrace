const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const todoRoutes = require("./routes/todos");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);

module.exports = app;

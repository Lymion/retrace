const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-123";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { requireAuth, JWT_SECRET };

require("dotenv").config({ path: "../.env" });
const app = require("./app");

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Todo server running on http://localhost:${port}`);
});

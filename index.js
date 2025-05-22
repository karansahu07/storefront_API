const express = require("express");
const cors = require("cors");
require("dotenv").config();

const shopifyRoutes = require("./routes/shopify");

const app = express();
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS.split(" "),
  })
);
app.use(express.json());

app.use("/api", shopifyRoutes);

app.get('/', (req, res) => {
  res.send('server is running');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);

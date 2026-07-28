import { createRequire } from "module";
const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();
import express from "express";
import cors from "cors";
import authRoutes from "./src/routes/authRoutes.js";
import ticketRoutes from "./src/routes/ticketRoutes.js";
import supportRoutes from "./src/routes/supportRoutes.js";
import inviteRoutes from "./src/routes/inviteRoutes.js";
import documentReviewRoutes from "./src/routes/documentReviewRoutes.js";
const app = express();
/* ===============================
   IMPORTANT: MIDDLEWARE FIRST
=================================*/
app.use(cors({
  origin: [
    "http://localhost:3002",
    "http://localhost:5173",
    "http://localhost:5174",
    "https://supp.sabbpe.com",
    "https://onboardinguat.sabbpe.com",
    "https://mockbank.sabbpe.com",
    "https://onboardingadminbckenduat.sabbpe.com",
    "https://suppprod.sabbpe.com",
    "https://onboarding.sabbpe.com",
    "https://mockbankprod.sabbpe.com",
    "https://onboardingadminbckendprod.sabbpe.com",
    "https://onboardingprodbckend.sabbpe.com",
    "https://camsprod.sabbpe.com"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.use(express.json());
/* ===============================
   ROUTES
=================================*/
app.get("/", (req, res) => {
  res.json({ message: "SabbPe Admin Backend Running 🚀" });
});
app.use("/api/auth", authRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/document-review", documentReviewRoutes);
/* ===============================
   ERROR HANDLER
=================================*/
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong" });
});
/* ===============================
   START SERVER
=================================*/
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

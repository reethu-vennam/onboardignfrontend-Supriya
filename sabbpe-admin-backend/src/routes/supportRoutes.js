import express from "express";
import { createSupport } from "../controllers/supportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create", protect, createSupport);

export default router;
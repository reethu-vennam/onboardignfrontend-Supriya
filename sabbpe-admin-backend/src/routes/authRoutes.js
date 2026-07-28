import express from "express";
import {
  register,
  login,
  getSupportUsers,
  createSupportUser,
  toggleSupportStatus,
  deleteSupportUser ,
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.get(
  "/support-users",
  protect,
  authorizeRoles("admin", "super_admin"),
  getSupportUsers
);

router.post(
  "/create-support",
  protect,
  authorizeRoles("admin", "super_admin"),
  createSupportUser
);

router.post(
  "/support-toggle",
  protect,
  authorizeRoles("admin", "super_admin"),
  toggleSupportStatus
);
router.post(
  "/support-delete",
  protect,
  authorizeRoles("admin", "super_admin"),
  deleteSupportUser
);

export default router;


import express from "express";
import {
  createNewTicket,
  createMerchantTicket,
  getTickets,
  assignTicket,
  updateTicketStatus,
  getTicketStats,
  getMerchantTickets,
  getMerchantTicketMessages,
  sendMerchantTicketMessage,
  testEmail,
  reviewMerchant,
  getMerchantReviewData,
  getTicketMessages,
  sendTicketMessage,
  getKYCList,
  verifyCPV,
  rejectCPV,
  getAllDocuments,
  reviewDocument
} from "../controllers/ticketController.js";

import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { getAssignedKYCForSupport } from "../controllers/ticketController.js";
const router = express.Router();

/* =====================================
   ADMIN / SUPPORT CORE ROUTES
===================================== */

// Create ticket
router.post("/", protect, createNewTicket);

// Get tickets (role-based)
router.get("/", protect, getTickets);

// Assign ticket (Admin / Super Admin only)
router.post(
  "/assign",
  protect,
  authorizeRoles("super_admin", "admin"),
  assignTicket
);

// Update ticket status
router.post("/status", protect, updateTicketStatus);

// Dashboard stats
router.get(
  "/stats",
  protect,
  authorizeRoles("super_admin", "admin"),
  getTicketStats
);

/* =====================================
   MERCHANT REVIEW ROUTES
===================================== */

// Verify CPV
router.post(
  "/verify-cpv",
  protect,
  authorizeRoles("admin", "super_admin"),
  verifyCPV
);

// Reject CPV
router.post(
  "/reject-cpv",
  protect,
  authorizeRoles("admin", "super_admin"),
  rejectCPV
);

// Approve / Reject Merchant  🔥 (MUST BE ABOVE dynamic routes)
router.post(
  "/merchant-review",
  protect,
  authorizeRoles("admin", "super_admin"),
  reviewMerchant
);

// Get merchant review data
router.get(
  "/merchant-review/:merchantId",
  protect,
  authorizeRoles("admin", "super_admin", "support"),
  getMerchantReviewData
);

// KYC list
router.get(
  "/kyc-list",
  protect,
  authorizeRoles("admin", "super_admin","support"),
  getKYCList
);
router.get(
  "/support/assigned-kyc",
  protect,
  authorizeRoles("support"),
  getAssignedKYCForSupport
);

// Get all documents (Doc Reviewer)
router.get(
  "/all-documents",
  protect,
  authorizeRoles("admin", "super_admin", "support"),
  getAllDocuments
);

// Review a document (approve/reject)
router.post(
  "/review-document",
  protect,
  authorizeRoles("admin", "super_admin", "support"),
  reviewDocument
);

/* =====================================
   MERCHANT TICKET ROUTES
===================================== */

// Merchant creates ticket (public)
router.post("/merchant", createMerchantTicket);

// Merchant view own tickets
router.get("/merchant/:merchant_id", getMerchantTickets);

// Merchant ticket messages
router.get("/merchant/:ticketId/messages", getMerchantTicketMessages);
router.post("/merchant/:ticketId/messages", sendMerchantTicketMessage);

/* =====================================
   EMAIL TEST ROUTE
===================================== */

router.get("/test-email", testEmail);

/* =====================================
   TICKET CHAT (Dynamic Routes LAST)
===================================== */

// IMPORTANT: Keep dynamic routes at bottom
router.get("/:ticketId/messages", protect, getTicketMessages);
router.post("/:ticketId/messages", protect, sendTicketMessage);

export default router;
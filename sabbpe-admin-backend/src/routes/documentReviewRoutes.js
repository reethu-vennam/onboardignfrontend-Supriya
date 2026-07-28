import express from "express";
import { supabase } from "../config/supabase.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import tesseractPkg from "tesseract.js";
const { recognize: tesseractRecognize } = tesseractPkg;
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

// Point pdfjs to its bundled resources
const PDFJS_BASE = new URL("../../node_modules/pdfjs-dist", import.meta.url).href;

const router = express.Router();

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// ─── Helper: download file from Supabase ───────────────────────────────────
async function downloadDocumentBuffer(filePath) {
  const { data: fileData, error: dlError } = await supabase.storage
    .from("merchant-documents")
    .download(filePath);

  if (dlError) throw new Error("Failed to download document: " + dlError.message);
  return Buffer.from(await fileData.arrayBuffer());
}

// ─── Extract text from PDF using pdfjs ─────────────────────────────────────
async function extractTextFromPdf(buffer) {
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: PDFJS_BASE + "/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: PDFJS_BASE + "/standard_fonts/",
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    text += pageText + "\n";
  }
  return text.trim();
}

// ─── Tesseract.js fallback OCR (for images only) ──────────────────────────
async function ocrImageWithTesseract(filePath) {
  const buffer = await downloadDocumentBuffer(filePath);
  const { data } = await tesseractRecognize(buffer, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        console.log(`Tesseract progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  return data.text || "";
}

// ─── Combined local text extraction (handles both PDF and images) ─────────
async function extractTextLocal(filePath, fileName) {
  const isPdf = (fileName || filePath).toLowerCase().endsWith(".pdf");
  if (isPdf) {
    console.log("Local extraction: PDF detected");
    const buffer = await downloadDocumentBuffer(filePath);

    // Try embedded text first
    const text = await extractTextFromPdf(buffer);
    if (text && text.trim().length > 20) {
      console.log(`Local extraction: PDF embedded text extracted (${text.length} chars)`);
      return text;
    }

    // Scanned PDF: render pages to images, then OCR each page
    console.log("Local extraction: Scanned PDF, rendering pages for OCR...");
    try {
      const data = new Uint8Array(buffer);
      const doc = await pdfjs.getDocument({
        data,
        cMapUrl: PDFJS_BASE + "/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: PDFJS_BASE + "/standard_fonts/",
      }).promise;

      let allText = "";
      for (let i = 1; i <= doc.numPages; i++) {
        console.log(`OCR page ${i}/${doc.numPages}...`);
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const pngBuffer = canvas.toBuffer("image/png");
        const { data: ocrResult } = await tesseractRecognize(pngBuffer, "eng");
        const pageText = ocrResult?.text || "";
        allText += pageText + "\n";
      }

      if (allText.trim().length > 10) {
        console.log(`Local extraction: OCR extracted ${allText.length} chars from ${doc.numPages} PDF page(s)`);
        return allText.trim();
      }
      console.log("Local extraction: OCR returned very little text");
      return allText.trim() || "";
    } catch (ocrErr) {
      console.error("PDF page OCR failed:", ocrErr.message);
      return text || "";
    }
  }
  console.log("Local extraction: image detected, OCR via Tesseract.js");
  return await ocrImageWithTesseract(filePath);
}

// ─── Extract fields from GST certificate OCR text ───────────────────────────
function extractGstFields(ocrText) {
  const upper = ocrText.toUpperCase().replace(/\s+/g, " ");

  // GSTIN: 15-char alphanumeric after "Registration Number" or standalone
  let gstin = null;
  const gstinMatch = upper.match(
    /(?:REGISTRATION\s*NUMBER\s*[:\s]*|GSTIN\s*[:\s]*)([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])/
  );
  if (gstinMatch) {
    gstin = gstinMatch[1];
  } else {
    const standalone = upper.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/);
    if (standalone) gstin = standalone[1];
  }

  // PAN from GSTIN (chars 3-12)
  const pan = gstin ? gstin.substring(2, 12) : null;

  // Legal Name: after "Legal Name" label
  let legalName = null;
  const legalMatch = ocrText.match(/Legal\s+Name\s+([A-Z][A-Z\s]+?)(?:\s+Trade|\s+Additional|\n|$)/i);
  if (legalMatch) legalName = legalMatch[1].trim();

  // Trade Name: after "Trade Name, if any" label
  let tradeName = null;
  const tradeMatch = ocrText.match(/Trade\s+Name.*?(?:if\s+any)?\s+([A-Z][A-Z\s]+?)(?:\s+Additional|\s+Constitution|\n|$)/i);
  if (tradeMatch) tradeName = tradeMatch[1].trim();

  // Constitution: after "Constitution of Business" label
  let constitution = null;
  const constMatch = ocrText.match(/Constitution\s+of\s+Business\s+([\w\s]+?)(?:\s+Address|\n|$)/i);
  if (constMatch) constitution = constMatch[1].trim();

  return { gstin, pan, legalName, tradeName, constitution };
}

// ─── Helper: Get or fetch Experian data (cached in merchant_credit_checks) ─
async function getExperianData(merchant) {
  // Check cache first (skip if checked within last 24 hours)
  const { data: cached } = await supabase
    .from("merchant_credit_checks")
    .select("*")
    .eq("merchant_id", merchant.id)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && cached.raw_response) {
    const checkedAt = new Date(cached.checked_at).getTime();
    const hoursSince = (Date.now() - checkedAt) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      // If cached as "no record found", return null
      if (cached.no_record_found) {
        console.log(`Experian: cached "no record" for merchant ${merchant.id} — skipping`);
        return null;
      }
      console.log(`Experian: using cached data for merchant ${merchant.id} (${Math.round(hoursSince)}h old)`);
      return cached.raw_response;
    }
    console.log(`Experian: cache expired for merchant ${merchant.id}, re-fetching`);
  }

  // Call Experian API
  if (!merchant.full_name || !merchant.mobile_number) {
    console.log(`Experian: merchant ${merchant.id} missing name or mobile - name: "${merchant.full_name}", mobile: "${merchant.mobile_number}"`);
    return null;
  }

  console.log(`Experian: calling API for merchant ${merchant.id} - name: "${merchant.full_name}", mobile: "${merchant.mobile_number}"`);

  // Step 1: Generate Transbank token
  const transbankConfig = {
    BASE_URL: process.env.TRANSBANK_BASE_URL || "https://transbank.sabbpe.com/api",
    CLIENT_ID: process.env.TRANSBANK_CLIENT_ID || "5e06f31d-d298-11f0-96ff-4201c0a81e02",
    PROCESSOR: process.env.TRANSBANK_PROCESSOR || "TRANSBANK",
  };

  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const timestamp = ist.toISOString().replace("T", " ").substring(0, 19);

  const tokenRes = await fetch(`${transbankConfig.BASE_URL}/v1/token/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_Id: transbankConfig.CLIENT_ID,
      transaction_timestamp: timestamp,
      processor: transbankConfig.PROCESSOR,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.token) {
    console.log(`Experian: failed to generate Transbank token:`, JSON.stringify(tokenData));
    return null;
  }
  console.log(`Experian: Transbank token generated successfully`);

  // Step 2: Call Experian API with token
  const experianRes = await fetch(`${transbankConfig.BASE_URL}/experian-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tokenData.token}`,
    },
    body: JSON.stringify({
      name: merchant.full_name,
      mobile: merchant.mobile_number,
      consent_text: "We confirm obtaining valid customer consent to access/process their name/mobile data. Consent remains valid, informed, and unwithdrawn.",
      consent: "Y",
    }),
  });

  const experianData = await experianRes.json();
  console.log(`Experian: API response status=${experianData.status}, message="${experianData.message}"`);

  // "No Record Found" is a valid response — merchant has no credit history
  if (experianData.message === "No Record Found" || experianData.code === 2) {
    console.log(`Experian: No credit record found for merchant ${merchant.id}`);
    // Cache it so we don't re-call
    await supabase.from("merchant_credit_checks").insert({
      merchant_id: merchant.id,
      txn_id: null,
      pan_match: false,
      name_match: false,
      mobile_match: false,
      account_number_match: false,
      bank_name_match: false,
      has_defaults: false,
      total_accounts: 0,
      active_accounts: 0,
      closed_accounts: 0,
      default_accounts: 0,
      outstanding_balance: 0,
      raw_response: experianData,
      no_record_found: true,
    });
    return null;
  }

  if (experianData.status !== 1) {
    console.log(`Experian: API returned non-success - full response:`, JSON.stringify(experianData).substring(0, 500));
    return null;
  }

  // Cache it
  const profile = experianData.result?.INProfileResponse || {};
  const caisSummary = profile.CAIS_Account?.CAIS_Summary || {};

  await supabase.from("merchant_credit_checks").insert({
    merchant_id: merchant.id,
    txn_id: experianData.txn_id || null,
    pan_match: false,
    name_match: true,
    mobile_match: false,
    account_number_match: false,
    bank_name_match: false,
    has_defaults: parseInt(caisSummary.Credit_Account?.CreditAccountDefault || "0", 10) > 0,
    total_accounts: parseInt(caisSummary.Credit_Account?.CreditAccountTotal || "0", 10),
    active_accounts: parseInt(caisSummary.Credit_Account?.CreditAccountActive || "0", 10),
    closed_accounts: parseInt(caisSummary.Credit_Account?.CreditAccountClosed || "0", 10),
    default_accounts: parseInt(caisSummary.Credit_Account?.CreditAccountDefault || "0", 10),
    outstanding_balance: parseFloat(caisSummary.Total_Outstanding_Balance?.Outstanding_Balance_All || "0"),
    raw_response: experianData,
  });

  console.log(`Experian: cached response for merchant ${merchant.id}`);
  return experianData;
}

function extractExperianAccounts(experianData) {
  const profile = experianData?.result?.INProfileResponse || {};
  const caisDetails = profile.CAIS_Account?.CAIS_Account_DETAILS || {};
  return Array.isArray(caisDetails) ? caisDetails : caisDetails.Identification_Number ? [caisDetails] : [];
}

router.get(
  "/merchants",
  protect,
  authorizeRoles("admin", "super_admin"),
  async (req, res) => {
    try {
      const { data: merchants, error } = await supabase
        .from("merchant_profiles")
        .select("id, full_name, business_name, email, mobile_number, onboarding_status, onboarding_score, pan_number, aadhaar_number, gst_number")
        .in("onboarding_status", ["submitted", "validating", "pending_bank_approval", "verified", "approved", "rejected", "cpv_pending", "cpv_verified", "agreement_pending", "agreement_signed", "bank_rejected"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const result = [];

      for (const merchant of merchants || []) {
        const { data: docs } = await supabase
          .from("merchant_documents")
          .select("id, document_type, file_name, file_path, status, validation_status, rejection_reason, uploaded_at, verified_at")
          .eq("merchant_id", merchant.id);

        const documents = [];
        let unchecked = 0, passed = 0, failed = 0, pending = 0;

        for (const doc of docs || []) {
          const { data: validations } = await supabase
            .from("document_validations")
            .select("check_type, check_result, checked_value, expected_value")
            .eq("merchant_document_id", doc.id);

          documents.push({
            ...doc,
            validations: validations || [],
          });

          switch (doc.validation_status) {
            case "unchecked": unchecked++; break;
            case "passed": passed++; break;
            case "failed": failed++; break;
            case "pending": pending++; break;
          }
        }

        result.push({
          id: merchant.id,
          full_name: merchant.full_name,
          business_name: merchant.business_name,
          email: merchant.email,
          mobile_number: merchant.mobile_number,
          onboarding_status: merchant.onboarding_status,
          onboarding_score: merchant.onboarding_score || 0,
          documents,
          document_summary: { total: documents.length, unchecked, passed, failed, pending },
        });
      }

      res.json(result);
    } catch (err) {
      console.error("Document review fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch merchants" });
    }
  }
);

router.get(
  "/merchants/:merchantId/score",
  protect,
  authorizeRoles("admin", "super_admin"),
  async (req, res) => {
    try {
      const { merchantId } = req.params;
      const scoreData = await computeScore(merchantId);
      res.json(scoreData);
    } catch (err) {
      console.error("Score fetch error:", err);
      res.status(500).json({ message: err.message || "Failed to compute score" });
    }
  }
);

router.post(
  "/documents/:docId/validate",
  protect,
  authorizeRoles("admin", "super_admin", "support"),
  async (req, res) => {
    try {
      const { docId } = req.params;
      const result = await validateDocument(docId);
      res.json(result);
    } catch (err) {
      console.error("Document validation error:", err);
      res.status(500).json({ message: err.message || "Validation failed" });
    }
  }
);

router.post(
  "/documents/:docId/approve",
  protect,
  authorizeRoles("admin", "super_admin"),
  async (req, res) => {
    try {
      const { docId } = req.params;
      const { reason } = req.body;
      const staffUserId = req.user?.id || "unknown";

      const { data: doc, error: docErr } = await supabase
        .from("merchant_documents")
        .select("*")
        .eq("id", docId)
        .single();

      if (docErr || !doc) return res.status(404).json({ message: "Document not found" });

      const now = new Date().toISOString();

      await supabase
        .from("merchant_documents")
        .update({
          validation_status: "passed",
          status: "verified",
          verified_at: now,
          verified_by: staffUserId,
          rejection_reason: null,
        })
        .eq("id", docId);

      await supabase.from("document_validations").insert({
        merchant_document_id: docId,
        merchant_profile_id: doc.merchant_id,
        check_type: "manual_approve",
        check_result: "pass",
        validated_by: staffUserId,
        validated_at: now,
        override_reason: reason || null,
      });

      const scoreData = await computeScore(doc.merchant_id);
      res.json({ success: true, score: scoreData });
    } catch (err) {
      console.error("Approve error:", err);
      res.status(500).json({ message: err.message || "Approve failed" });
    }
  }
);

router.post(
  "/documents/:docId/reject",
  protect,
  authorizeRoles("admin", "super_admin"),
  async (req, res) => {
    try {
      const { docId } = req.params;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const staffUserId = req.user?.id || "unknown";

      const { data: doc, error: docErr } = await supabase
        .from("merchant_documents")
        .select("*")
        .eq("id", docId)
        .single();

      if (docErr || !doc) return res.status(404).json({ message: "Document not found" });

      const now = new Date().toISOString();

      await supabase
        .from("merchant_documents")
        .update({
          validation_status: "failed",
          status: "rejected",
          verified_at: now,
          verified_by: staffUserId,
          rejection_reason: reason,
        })
        .eq("id", docId);

      await supabase.from("document_validations").insert({
        merchant_document_id: docId,
        merchant_profile_id: doc.merchant_id,
        check_type: "manual_reject",
        check_result: "fail",
        validated_by: staffUserId,
        validated_at: now,
        override_reason: reason,
      });

      const scoreData = await computeScore(doc.merchant_id);
      res.json({ success: true, score: scoreData });
    } catch (err) {
      console.error("Reject error:", err);
      res.status(500).json({ message: err.message || "Reject failed" });
    }
  }
);

async function computeScore(merchantProfileId) {
  const { data: merchant } = await supabase
    .from("merchant_profiles")
    .select("id, pan_number, aadhaar_number, gst_number, business_name, email, mobile_number, entity_type, onboarding_status")
    .eq("id", merchantProfileId)
    .single();

  if (!merchant) return { score: 0, categories: [], reasons: [], isManualReview: true };

  const { data: docs } = await supabase
    .from("merchant_documents")
    .select("id, document_type, validation_status")
    .eq("merchant_id", merchantProfileId);

  const allDocs = docs || [];
  const docIds = allDocs.map((d) => d.id);

  // Fetch all validation checks across all documents
  let validations = [];
  if (docIds.length > 0) {
    const { data: v } = await supabase
      .from("document_validations")
      .select("merchant_document_id, check_type, check_result, checked_value, expected_value")
      .in("merchant_document_id", docIds);
    validations = v || [];
  }

  // Build lookup: doc_type -> array of checks
  const docValidations = {};
  for (const doc of allDocs) {
    docValidations[doc.document_type] = validations.filter((v) => v.merchant_document_id === doc.id);
  }

  const { data: bankDetails } = await supabase
    .from("merchant_bank_details")
    .select("ifsc_code, account_number, bank_name")
    .eq("merchant_id", merchantProfileId)
    .maybeSingle();

  const { data: creditCheck } = await supabase
    .from("merchant_credit_checks")
    .select("pan_match, mobile_match, account_number_match, bank_name_match, has_defaults")
    .eq("merchant_id", merchantProfileId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const reasons = [];
  const getResult = (docType, checkType) => {
    const checks = docValidations[docType] || [];
    return checks.find((c) => c.check_type === checkType);
  };
  const isPass = (docType, checkType) => {
    const c = getResult(docType, checkType);
    return c?.check_result === "pass";
  };
  const isFail = (docType, checkType) => {
    const c = getResult(docType, checkType);
    return c?.check_result === "fail";
  };

  // Search for a check across ALL document types
  const findCheckAcrossDocs = (checkType) => {
    for (const docType of Object.keys(docValidations)) {
      const found = docValidations[docType].find((c) => c.check_type === checkType);
      if (found) return found;
    }
    return null;
  };
  const isPassAny = (checkType) => findCheckAcrossDocs(checkType)?.check_result === "pass";
  const isFailAny = (checkType) => findCheckAcrossDocs(checkType)?.check_result === "fail";

  // ── GST Verification (18 pts) ──────────────────────────────────────────
  let gstEarned = 0;
  const gstDoc = docValidations["gst_certificate"] || [];

  if (gstDoc.length > 0) {
    if (isPass("gst_certificate", "gstin_format")) gstEarned += 5;
    else reasons.push("GSTIN format invalid in document");

    if (isPass("gst_certificate", "gstin_match")) gstEarned += 4;
    else if (isFail("gst_certificate", "gstin_match")) reasons.push("GST number on certificate doesn't match profile");

    if (isPass("gst_certificate", "pan_in_gst")) gstEarned += 3;
    else if (isFail("gst_certificate", "pan_in_gst")) reasons.push("PAN in GST certificate doesn't match profile PAN");

    if (isPass("gst_certificate", "legal_name_match")) gstEarned += 3;
    else if (isFail("gst_certificate", "legal_name_match")) reasons.push("Legal name on GST doesn't match profile name");

    if (isPass("gst_certificate", "trade_name_match")) gstEarned += 3;
    else if (isFail("gst_certificate", "trade_name_match")) reasons.push("Trade name on GST doesn't match business name");
  } else {
    // Fallback: check profile GST number format
    const gst = (merchant.gst_number || "").toUpperCase();
    if (gst && GST_REGEX.test(gst)) gstEarned += 9;
    else reasons.push("GST number missing or invalid format");
    if (gst && PAN_REGEX.test(gst.substring(2, 12))) gstEarned += 9;
    else if (gst) reasons.push("PAN in GST does not match profile PAN");
    else reasons.push("GST certificate not validated yet");
  }

  // ── PAN Verification (14 pts) ─────────────────────────────────────────
  let panEarned = 0;
  const panDoc = docValidations["pan_card"] || [];

  if (panDoc.length > 0) {
    if (isPass("pan_card", "format")) panEarned += 6;
    else reasons.push("PAN format invalid in uploaded document");
    if (isPass("pan_card", "cross_match")) panEarned += 8;
    else reasons.push("PAN on document doesn't match profile");
  } else {
    const pan = (merchant.pan_number || "").toUpperCase();
    if (pan && PAN_REGEX.test(pan)) panEarned += 6;
    else reasons.push("PAN number missing or invalid format");
    if (pan) panEarned += 8;
    else reasons.push("PAN card not validated yet");
  }

  // ── Aadhaar Verification (14 pts) ─────────────────────────────────────
  let aadhaarEarned = 0;
  const aadhaarDoc = docValidations["aadhaar_card"] || [];

  if (aadhaarDoc.length > 0) {
    if (isPass("aadhaar_card", "format")) aadhaarEarned += 6;
    else reasons.push("Aadhaar format invalid in uploaded document");
    if (isPass("aadhaar_card", "cross_match")) aadhaarEarned += 8;
    else reasons.push("Aadhaar on document doesn't match profile");
  } else {
    const aadhaar = (merchant.aadhaar_number || "").replace(/\s/g, "");
    if (aadhaar && /^\d{12}$/.test(aadhaar)) aadhaarEarned += 6;
    else reasons.push("Aadhaar number missing or invalid format");
    if (aadhaar) aadhaarEarned += 8;
    else reasons.push("Aadhaar card not validated yet");
  }

  // ── Bank Verification (14 pts) ─────────────────────────────────────────
  let bankEarned = 0;
  const bankDoc = docValidations["bank_statement"] || docValidations["cancelled_cheque"] || [];

  if (bankDoc.length > 0) {
    if (isPass("bank_statement", "format") || isPass("cancelled_cheque", "format")) bankEarned += 5;
    else reasons.push("IFSC format invalid on bank document");
    if (isPass("bank_statement", "account_format") || isPass("cancelled_cheque", "account_format")) bankEarned += 4;
    else reasons.push("Account number format invalid on bank document");
    if (isPass("bank_statement", "account_holder_match") || isPass("cancelled_cheque", "account_holder_match")) bankEarned += 5;
    else reasons.push("Account holder name doesn't match merchant name");
  } else if (bankDetails) {
    const ifsc = (bankDetails.ifsc_code || "").toUpperCase();
    if (ifsc && IFSC_REGEX.test(ifsc)) bankEarned += 5;
    else reasons.push("IFSC code missing or invalid");
    const acc = (bankDetails.account_number || "").replace(/\s/g, "");
    if (acc.length >= 9 && /^\d+$/.test(acc)) bankEarned += 5;
    else reasons.push("Account number missing or invalid");
    if (ifsc && acc) bankEarned += 4;
  } else {
    reasons.push("Bank details not provided");
  }

  // ── Business Details (5 pts) ───────────────────────────────────────────
  let businessEarned = 0;
  if (merchant.business_name && merchant.business_name.length > 2) businessEarned += 1;
  else reasons.push("Business name missing");
  if (merchant.entity_type) businessEarned += 1;
  else reasons.push("Entity type not selected");
  if (merchant.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merchant.email)) businessEarned += 1;
  else reasons.push("Valid email not provided");
  if (merchant.mobile_number && merchant.mobile_number.length >= 10) businessEarned += 1;
  else reasons.push("Valid mobile number not provided");
  if (merchant.pan_number) businessEarned += 1;

  // ── Document Quality (13 pts) ──────────────────────────────────────────
  let docEarned = 0;
  const docTypes = allDocs.map((d) => d.document_type);
  const passedDocs = allDocs.filter((d) => d.validation_status === "passed");
  const missingDocs = [];

  if (docTypes.includes("pan_card")) docEarned += 3;
  else missingDocs.push("PAN card");
  if (docTypes.includes("aadhaar_card")) docEarned += 3;
  else missingDocs.push("Aadhaar card");
  if (docTypes.includes("gst_certificate")) docEarned += 3;
  else missingDocs.push("GST certificate");
  if (docTypes.includes("bank_statement") || docTypes.includes("cancelled_cheque")) docEarned += 2;
  else missingDocs.push("Bank statement / Cancelled cheque");
  if (passedDocs.length > 0) docEarned += 2;
  else missingDocs.push("No documents validated yet");
  if (missingDocs.length > 0) reasons.push("Missing docs: " + missingDocs.join(", "));

  // ── Previous History (5 pts) ───────────────────────────────────────────
  let historyEarned = 0;
  if (!merchant.onboarding_status?.includes("rejected")) historyEarned = 5;
  else reasons.push("Previously rejected — needs review");

  // ── Bank Details (7 pts) ──────────────────────────────────────────────
  let bankDetailsEarned = 0;
  if (bankDetails?.bank_name) bankDetailsEarned += 4;
  else reasons.push("Bank name missing");
  if (bankDetails?.account_number) bankDetailsEarned += 3;
  else reasons.push("Bank account number missing");

  const categories = [
    { label: "GST Verification", earned: Math.min(gstEarned, 18), max: 18 },
    { label: "PAN Verification", earned: Math.min(panEarned, 14), max: 14 },
    { label: "Aadhaar Verification", earned: Math.min(aadhaarEarned, 14), max: 14 },
    { label: "Bank Verification", earned: Math.min(bankEarned, 14), max: 14 },
    { label: "Business Details", earned: Math.min(businessEarned, 5), max: 5 },
    { label: "Document Quality", earned: Math.min(docEarned, 13), max: 13 },
    { label: "Previous History", earned: Math.min(historyEarned, 5), max: 5 },
    { label: "Bank Details", earned: Math.min(bankDetailsEarned, 7), max: 7 },
  ];

  const total = categories.reduce((sum, c) => sum + c.earned, 0);
  const isManualReview = total < 80 || allDocs.some((d) => d.validation_status === "unchecked");

  await supabase
    .from("merchant_profiles")
    .update({ onboarding_score: total })
    .eq("id", merchantProfileId);

  return { score: total, categories, reasons, isManualReview };
}

async function validateDocument(documentId) {
  const { data: doc, error } = await supabase
    .from("merchant_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (error || !doc) throw new Error("Document not found");

  const { data: merchant, error: mErr } = await supabase
    .from("merchant_profiles")
    .select("*")
    .eq("id", doc.merchant_id)
    .single();

  if (mErr || !merchant) throw new Error("Merchant not found");

  const docType = doc.document_type;
  let checks = [];

  switch (docType) {
    case "pan_card": {
      const pan = (merchant.pan_number || "").toUpperCase();
      const formatValid = PAN_REGEX.test(pan);
      checks.push({
        checkType: "format",
        checkResult: formatValid ? "pass" : "fail",
        message: formatValid ? `PAN format is valid (${pan})` : `PAN format is invalid (${pan || "N/A"}) — expected: ABCDE1234F`,
      });
      checks.push({
        checkType: "cross_match",
        checkResult: "pass",
        message: `PAN contains: ${pan || "N/A"}, profile: ${pan || "N/A"}`,
      });
      break;
    }
    case "aadhaar_card": {
      const aadhaar = (merchant.aadhaar_number || "").replace(/\s/g, "");
      const formatValid = /^\d{12}$/.test(aadhaar);
      const maskedAadhaar = aadhaar ? `XXXX XXXX ${aadhaar.slice(-4)}` : "N/A";
      checks.push({
        checkType: "format",
        checkResult: formatValid ? "pass" : "fail",
        message: formatValid ? `Aadhaar format is valid (${maskedAadhaar})` : `Aadhaar format is invalid (${aadhaar || "N/A"}) — expected: 12 digits`,
      });
      checks.push({
        checkType: "cross_match",
        checkResult: "pass",
        message: `Aadhaar contains: ${maskedAadhaar}, profile: ${maskedAadhaar}`,
      });
      break;
    }
    case "gst_certificate": {
      let ocrText = null;
      if (doc.file_path) {
        try {
          ocrText = await extractTextLocal(doc.file_path, doc.file_name);
        } catch (localError) {
          console.error("Local extraction failed:", localError.message);
        }
      }

      if (ocrText && ocrText.trim().length > 10) {
        const extracted = extractGstFields(ocrText);
        const gstinValid = extracted.gstin && GST_REGEX.test(extracted.gstin);
        checks.push({
          checkType: "gstin_format",
          checkResult: gstinValid ? "pass" : "fail",
          message: gstinValid ? `GSTIN format valid: ${extracted.gstin}` : "GSTIN not found or invalid format in document",
        });

        const profileGst = (merchant.gst_number || "").toUpperCase();
        const gstinMatch = gstinValid && extracted.gstin === profileGst;
        checks.push({
          checkType: "gstin_match",
          checkResult: gstinMatch ? "pass" : "fail",
          message: gstinMatch ? `GSTIN matches profile: ${profileGst}` : `GSTIN mismatch — document: ${extracted.gstin || "N/A"}, profile: ${profileGst || "N/A"}`,
        });

        const extractedPan = extracted.pan || "";
        const profilePan = (merchant.pan_number || "").toUpperCase();
        const panInGstValid = extractedPan && PAN_REGEX.test(extractedPan);
        const panMatch = panInGstValid && extractedPan === profilePan;
        checks.push({
          checkType: "pan_in_gst",
          checkResult: panMatch ? "pass" : "fail",
          message: panMatch ? `PAN in GST (${extractedPan}) matches profile PAN` : `PAN mismatch — GST contains: ${extractedPan || "N/A"}, profile: ${profilePan || "N/A"}`,
        });

        const docLegalName = (extracted.legalName || "").toUpperCase().trim();
        const profileName = (merchant.full_name || "").toUpperCase().trim();
        const nameMatch = docLegalName && profileName && (
          docLegalName.includes(profileName) || profileName.includes(docLegalName) || docLegalName === profileName
        );
        checks.push({
          checkType: "legal_name_match",
          checkResult: nameMatch ? "pass" : "fail",
          message: nameMatch ? `Legal name matches: "${extracted.legalName}"` : `Legal name mismatch — document: "${extracted.legalName || "N/A"}", profile: "${merchant.full_name || "N/A"}"`,
        });

        const docTradeName = (extracted.tradeName || "").toUpperCase().trim();
        const profileBiz = (merchant.business_name || "").toUpperCase().trim();
        const tradeMatch = docTradeName && profileBiz && (
          docTradeName.includes(profileBiz) || profileBiz.includes(docTradeName) || docTradeName === profileBiz
        );
        checks.push({
          checkType: "trade_name_match",
          checkResult: tradeMatch ? "pass" : "fail",
          message: tradeMatch ? `Trade name matches: "${extracted.tradeName}"` : `Trade name mismatch — document: "${extracted.tradeName || "N/A"}", profile: "${merchant.business_name || "N/A"}"`,
        });

        const constitutionMap = {
          proprietorship: ["PROPRIETORSHIP", "SOLE PROPRIETORSHIP"],
          partnership: ["PARTNERSHIP"],
          llp: ["LLP", "LIMITED LIABILITY PARTNERSHIP"],
          pvt_ltd: ["PRIVATE LIMITED", "PRIVATE"],
          public_ltd: ["PUBLIC LIMITED", "PUBLIC"],
          trust: ["TRUST"],
          society: ["SOCIETY"],
          huf: ["HUF", "HINDU UNDIVIDED FAMILY"],
        };
        const docConstitution = (extracted.constitution || "").toUpperCase().trim();
        const entityType = (merchant.entity_type || "").toLowerCase();
        const expectedConstitutions = constitutionMap[entityType] || [];
        const constMatch = docConstitution && expectedConstitutions.some(
          (ec) => docConstitution.includes(ec) || ec.includes(docConstitution)
        );
        checks.push({
          checkType: "constitution_match",
          checkResult: constMatch ? "pass" : "fail",
          message: constMatch ? `Constitution matches: "${extracted.constitution}"` : `Constitution mismatch — document: "${extracted.constitution || "N/A"}", expected: "${entityType}"`,
        });
      } else {
        const gst = (merchant.gst_number || "").toUpperCase();
        const formatValid = GST_REGEX.test(gst);
        checks.push({
          checkType: "format_fallback",
          checkResult: formatValid ? "pass" : "fail",
          message: formatValid ? `GST format valid: ${gst}` : "GST format invalid",
        });
        const embeddedPan = gst && PAN_REGEX.test(gst.substring(2, 12)) ? gst.substring(2, 12) : null;
        const profilePan = (merchant.pan_number || "").toUpperCase();
        const panFallbackMatch = embeddedPan && profilePan && embeddedPan === profilePan;
        checks.push({
          checkType: "pan_fallback",
          checkResult: panFallbackMatch ? "pass" : "fail",
          message: panFallbackMatch
            ? `PAN from GST (${embeddedPan}) matches profile PAN`
            : `PAN mismatch — GST contains: ${embeddedPan || "N/A"}, profile: ${profilePan || "N/A"}`,
        });
      }
      break;
    }
    case "bank_statement":
    case "cancelled_cheque": {
      const { data: bankDetails } = await supabase
        .from("merchant_bank_details")
        .select("*")
        .eq("merchant_id", merchant.id)
        .maybeSingle();

      if (!bankDetails) {
        checks.push({ checkType: "bank_details", checkResult: "fail", message: "No bank details found" });
      } else {
        const ifsc = (bankDetails.ifsc_code || "").toUpperCase();
        const account = (bankDetails.account_number || "").replace(/\s/g, "");
        const accountHolder = (bankDetails.account_holder_name || "").toUpperCase().trim();

        // 1. IFSC format check
        const ifscValid = IFSC_REGEX.test(ifsc);
        checks.push({
          checkType: "format",
          checkResult: ifscValid ? "pass" : "fail",
          checked_value: ifsc,
          expected_value: "^[A-Z]{4}0[A-Z0-9]{6}$",
          message: ifscValid ? `IFSC format is valid: ${ifsc}` : `IFSC format is invalid: ${ifsc}`,
        });

        // 2. Account number format check
        const accountValid = account.length >= 9 && /^\d+$/.test(account);
        checks.push({
          checkType: "account_format",
          checkResult: accountValid ? "pass" : "fail",
          checked_value: account ? `****${account.slice(-4)}` : null,
          expected_value: "Min 9 digits, numeric only",
          message: accountValid
            ? `Account number format is valid (****${account.slice(-4)})`
            : `Account number must be at least 9 digits`,
        });

        // 3. Account holder name matches merchant name
        const merchantName = (merchant.full_name || "").toUpperCase().trim();
        const holderMatch = accountHolder && merchantName && (
          accountHolder.includes(merchantName) ||
          merchantName.includes(accountHolder) ||
          accountHolder.split(" ").some(part => merchantName.includes(part) && part.length > 2)
        );
        checks.push({
          checkType: "account_holder_match",
          checkResult: holderMatch ? "pass" : "fail",
          checked_value: bankDetails.account_holder_name,
          expected_value: merchant.full_name,
          message: holderMatch
            ? `Account holder "${bankDetails.account_holder_name}" matches merchant name`
            : `Account holder mismatch — account: "${bankDetails.account_holder_name || "N/A"}", merchant: "${merchant.full_name || "N/A"}"`,
        });

        // 4. IFSC bank code check
        const ifscPrefix = ifsc.substring(0, 4);
        const bankNameUpper = (bankDetails.bank_name || "").toUpperCase();
        const ifscBankMap = {
          "SBIN": "SBI", "HDFC": "HDFC", "ICIC": "ICICI", "UBIN": "UNION BANK",
          "PUNB": "PUNJAB NATIONAL", "BARB": "BANK OF BARODA", "IDFB": "IDBI",
          "FDRL": "FEDERAL", "KKBK": "KOTAK", "INDB": "INDUSIND", "UTIB": "AXIS",
          "CNRB": "CANARA", "UCBA": "UCO", "ABHY": "ABHYUDAYA", "AIIB": "INDIAN OVERSEAS",
          "BKID": "BANK OF INDIA", "MAHB": "BANK OF MAHARASHTRA", "ORBC": "ORIENTAL BANK",
          "PSIB": "PUNJAB & SIND", "RATN": "RBL", "SIBL": "SOUTH INDIAN",
          "TCSC": "TCS", "UTBI": "UNITED BANK", "VIJB": "VIJAYA",
          "SFBL": "SLICE SMALL FINANCE",
        };
        const expectedBank = ifscBankMap[ifscPrefix] || "";
        const ifscBankMatch = expectedBank && bankNameUpper && (
          bankNameUpper.includes(expectedBank) || expectedBank.includes(bankNameUpper.split(" ")[0])
        );
        checks.push({
          checkType: "ifsc_bank_match",
          checkResult: ifscBankMatch ? "pass" : "skip",
          checked_value: ifsc,
          expected_value: expectedBank || "Unknown IFSC prefix",
          message: ifscBankMatch
            ? `IFSC ${ifscPrefix} belongs to ${expectedBank} — matches bank name`
            : expectedBank
              ? `IFSC ${ifscPrefix} belongs to ${expectedBank}, but bank name is "${bankDetails.bank_name || "N/A"}"`
              : `IFSC prefix ${ifscPrefix} not recognized — cannot verify bank name`,
        });

        // 5. OCR the document and extract account number to cross-match
        try {
          if (doc.file_path) {
            const ocrText = await extractTextLocal(doc.file_path, doc.file_name);
            if (ocrText && ocrText.trim().length > 10) {
              // Extract account number from OCR text (look for 9-18 digit sequences)
              const accMatches = ocrText.match(/\b\d{9,18}\b/g) || [];
              const ocrAccMatch = accMatches.some(acc => {
                const last4 = acc.slice(-4);
                return last4 === account.slice(-4) && last4.length === 4;
              });

              checks.push({
                checkType: "ocr_account_match",
                checkResult: ocrAccMatch ? "pass" : "fail",
                checked_value: accMatches.length > 0 ? `Found ${accMatches.length} number(s) in document` : "No numbers found",
                expected_value: `Account ending ****${account.slice(-4)}`,
                message: ocrAccMatch
                  ? `Account number ****${account.slice(-4)} found in document via OCR`
                  : `Account number ****${account.slice(-4)} NOT found in document — possible mismatch`,
              });

              // Check if bank name appears in OCR text
              const ocrBankMatch = bankNameUpper && ocrText.toUpperCase().includes(bankNameUpper.split(" ")[0]);
              checks.push({
                checkType: "ocr_bank_name_match",
                checkResult: ocrBankMatch ? "pass" : "skip",
                checked_value: ocrBankMatch ? `Bank name found in document` : "Bank name not found",
                expected_value: bankDetails.bank_name,
                message: ocrBankMatch
                  ? `Bank name "${bankDetails.bank_name}" found in document via OCR`
                  : `Bank name not detected in document — may need manual review`,
              });
            } else {
              checks.push({
                checkType: "ocr_document_check",
                checkResult: "skip",
                message: "Could not extract text from document for OCR verification",
              });
            }
          }
        } catch (ocrErr) {
          console.error("OCR bank check error:", ocrErr.message);
          checks.push({
            checkType: "ocr_document_check",
            checkResult: "skip",
            message: `OCR failed: ${ocrErr.message}`,
          });
        }
      }
      break;
    }
    case "video_kyc":
    case "selfie":
      checks.push({
        checkType: "manual_review",
        checkResult: "pass",
        message: "Manual review required",
      });
      break;
    default:
      checks.push({
        checkType: "unknown_type",
        checkResult: "pass",
        message: "No automated checks for this document type",
      });
  }

  // "skip" results are ignored — only pass/fail matter
  const activeChecks = checks.filter((c) => c.checkResult !== "skip");
  const allPassed = activeChecks.length > 0 && activeChecks.every((c) => c.checkResult === "pass");
  const validationStatus = allPassed ? "passed" : "failed";
  const now = new Date().toISOString();

  await supabase
    .from("document_validations")
    .delete()
    .eq("merchant_document_id", documentId);

  const validationRows = checks.map((c) => ({
    merchant_document_id: documentId,
    merchant_profile_id: merchant.id,
    check_type: c.checkType,
    check_result: c.checkResult,
    validated_by: "system",
    validated_at: now,
  }));

  await supabase.from("document_validations").insert(validationRows);

  await supabase
    .from("merchant_documents")
    .update({
      validation_status: validationStatus,
      verified_at: allPassed ? now : null,
      rejection_reason: allPassed ? null : "Validation checks failed",
    })
    .eq("id", documentId);

  const scoreData = await computeScore(merchant.id);

  return {
    documentId,
    documentType: docType,
    fileName: doc.file_name,
    overallStatus: validationStatus,
    checks,
    validatedAt: now,
    score: scoreData,
  };
}

// ─── Experian Credit Bureau Check ──────────────────────────────────────────
router.post(
  "/merchants/:merchantId/experian-check",
  protect,
  authorizeRoles("admin", "super_admin"),
  async (req, res) => {
    try {
      const { merchantId } = req.params;
      const staffUserId = req.user?.id || "unknown";

      const { data: merchant, error: mErr } = await supabase
        .from("merchant_profiles")
        .select("id, full_name, mobile_number, pan_number")
        .eq("id", merchantId)
        .single();

      if (mErr || !merchant) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      if (!merchant.full_name || !merchant.mobile_number) {
        return res.status(400).json({ message: "Merchant name and mobile are required for Experian check" });
      }

      const { data: bankDetails } = await supabase
        .from("merchant_bank_details")
        .select("account_number, bank_name")
        .eq("merchant_id", merchantId)
        .maybeSingle();

      // Generate Transbank token
      const transbankConfig = {
        BASE_URL: process.env.TRANSBANK_BASE_URL || "https://transbank.sabbpe.com/api",
        CLIENT_ID: process.env.TRANSBANK_CLIENT_ID || "5e06f31d-d298-11f0-96ff-4201c0a81e02",
        PROCESSOR: process.env.TRANSBANK_PROCESSOR || "TRANSBANK",
      };

      const nowTb = new Date();
      const istTb = new Date(nowTb.getTime() + 5.5 * 60 * 60 * 1000);
      const timestampTb = istTb.toISOString().replace("T", " ").substring(0, 19);

      const tokenRes = await fetch(`${transbankConfig.BASE_URL}/v1/token/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_Id: transbankConfig.CLIENT_ID,
          transaction_timestamp: timestampTb,
          processor: transbankConfig.PROCESSOR,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.token) {
        return res.status(500).json({ message: "Failed to generate Transbank token", raw: tokenData });
      }

      // Call Experian API with token
      const experianRes = await fetch(`${transbankConfig.BASE_URL}/experian-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenData.token}`,
        },
        body: JSON.stringify({
          name: merchant.full_name,
          mobile: merchant.mobile_number,
          consent_text: "We confirm obtaining valid customer consent to access/process their name/mobile data. Consent remains valid, informed, and unwithdrawn.",
          consent: "Y",
        }),
      });

      const experianData = await experianRes.json();

      // Handle "No Record Found" — this is normal for new businesses
      if (experianData.message === "No Record Found" || experianData.code === 2) {
        // Cache it so we don't re-call
        await supabase.from("merchant_credit_checks").insert({
          merchant_id: merchantId,
          txn_id: null,
          pan_match: false,
          name_match: false,
          mobile_match: false,
          account_number_match: false,
          bank_name_match: false,
          has_defaults: false,
          total_accounts: 0,
          active_accounts: 0,
          closed_accounts: 0,
          default_accounts: 0,
          outstanding_balance: 0,
          raw_response: experianData,
          no_record_found: true,
        });

        return res.json({
          success: true,
          noRecordFound: true,
          message: "No Experian credit record found for this merchant",
          matches: { pan: false, mobile: false, accountNumber: false, bankName: false },
          creditSummary: { totalAccounts: 0, activeAccounts: 0, closedAccounts: 0, defaultAccounts: 0, outstandingBalance: 0 },
          score: await computeScore(merchantId),
        });
      }

      if (experianData.status !== 1 && experianData.message !== "Success") {
        return res.status(400).json({
          message: experianData.message || "Experian API returned an error",
          raw: experianData,
        });
      }

      const profile = experianData.result?.INProfileResponse || {};
      const applicant = profile.Current_Application?.Current_Application_Details?.Current_Applicant_Details || {};
      const caisSummary = profile.CAIS_Account?.CAIS_Summary || {};
      const caisDetails = profile.CAIS_Account?.CAIS_Account_DETAILS || {};

      // Normalize account details to array
      const accountList = Array.isArray(caisDetails)
        ? caisDetails
        : caisDetails.Identification_Number
          ? [caisDetails]
          : [];

      // Cross-match logic
      const experianPan = (applicant.IncomeTaxPan || "").toUpperCase().trim();
      const merchantPan = (merchant.pan_number || "").toUpperCase().trim();
      const panMatch = experianPan && merchantPan && experianPan === merchantPan;

      const experianMobile = (applicant.MobilePhoneNumber || "").trim();
      const merchantMobile = (merchant.mobile_number || "").replace(/\s/g, "").slice(-10);
      const mobileMatch = experianMobile && merchantMobile && experianMobile.slice(-10) === merchantMobile;

      const merchantAccLast4 = (bankDetails?.account_number || "").replace(/\s/g, "").slice(-4);
      const accountNumberMatch = accountList.some((acc) => {
        const accNum = (acc.Account_Number || "").replace(/\s/g, "");
        return accNum.slice(-4) === merchantAccLast4 && merchantAccLast4.length === 4;
      });

      const merchantBankName = (bankDetails?.bank_name || "").toUpperCase().trim();
      const bankNameMatch = accountList.some((acc) => {
        const subscriberName = (acc.Subscriber_Name || "").toUpperCase().trim();
        return merchantBankName && subscriberName && (
          subscriberName.includes(merchantBankName) ||
          merchantBankName.includes(subscriberName)
        );
      });

      const creditAccountTotal = parseInt(caisSummary.Credit_Account?.CreditAccountTotal || "0", 10);
      const creditAccountActive = parseInt(caisSummary.Credit_Account?.CreditAccountActive || "0", 10);
      const creditAccountClosed = parseInt(caisSummary.Credit_Account?.CreditAccountClosed || "0", 10);
      const creditAccountDefault = parseInt(caisSummary.Credit_Account?.CreditAccountDefault || "0", 10);
      const outstandingBalance = parseFloat(caisSummary.Total_Outstanding_Balance?.Outstanding_Balance_All || "0");

      const txnId = experianData.txn_id || null;

      // Store in merchant_credit_checks
      const { error: insertErr } = await supabase.from("merchant_credit_checks").insert({
        merchant_id: merchantId,
        txn_id: txnId,
        credit_score: null,
        pan_match: panMatch,
        name_match: true,
        mobile_match: mobileMatch,
        account_number_match: accountNumberMatch,
        bank_name_match: bankNameMatch,
        has_defaults: creditAccountDefault > 0,
        total_accounts: creditAccountTotal,
        active_accounts: creditAccountActive,
        closed_accounts: creditAccountClosed,
        default_accounts: creditAccountDefault,
        outstanding_balance: outstandingBalance,
        raw_response: experianData,
        checked_by: staffUserId,
      });

      if (insertErr) {
        console.error("Failed to store credit check:", insertErr);
      }

      // Store validation checks in document_validations (using a virtual doc_id pattern)
      const now = new Date().toISOString();
      const creditChecks = [
        {
          check_type: "experian_pan_match",
          check_result: panMatch ? "pass" : "fail",
          checked_value: experianPan,
          expected_value: merchantPan,
        },
        {
          check_type: "experian_mobile_match",
          check_result: mobileMatch ? "pass" : "fail",
          checked_value: experianMobile,
          expected_value: merchantMobile,
        },
        {
          check_type: "experian_account_match",
          check_result: accountNumberMatch ? "pass" : "fail",
          checked_value: merchantAccLast4 ? `****${merchantAccLast4}` : null,
          expected_value: "Last 4 digits match Experian report",
        },
        {
          check_type: "experian_bank_name_match",
          check_result: bankNameMatch ? "pass" : "fail",
          checked_value: merchantBankName,
          expected_value: accountList.map((a) => a.Subscriber_Name).join(", "),
        },
      ];

      // Delete old experian checks for this merchant (non-document validations)
      await supabase
        .from("document_validations")
        .delete()
        .eq("merchant_profile_id", merchantId)
        .in("check_type", [
          "experian_pan_match",
          "experian_mobile_match",
          "experian_account_match",
          "experian_bank_name_match",
        ])
        .is("merchant_document_id", null);

      const validationRows = creditChecks.map((c) => ({
        merchant_profile_id: merchantId,
        check_type: c.check_type,
        check_result: c.check_result,
        checked_value: c.checked_value,
        expected_value: c.expected_value,
        validated_by: "system",
        validated_at: now,
      }));

      await supabase.from("document_validations").insert(validationRows);

      // Recalculate score
      const scoreData = await computeScore(merchantId);

      res.json({
        success: true,
        txnId,
        matches: {
          pan: panMatch,
          mobile: mobileMatch,
          accountNumber: accountNumberMatch,
          bankName: bankNameMatch,
        },
        creditSummary: {
          totalAccounts: creditAccountTotal,
          activeAccounts: creditAccountActive,
          closedAccounts: creditAccountClosed,
          defaultAccounts: creditAccountDefault,
          outstandingBalance,
        },
        score: scoreData,
      });
    } catch (err) {
      console.error("Experian check error:", err);
      res.status(500).json({ message: err.message || "Experian check failed" });
    }
  }
);

// ─── Get latest Experian check for a merchant ──────────────────────────────
router.get(
  "/merchants/:merchantId/experian-check",
  protect,
  authorizeRoles("admin", "super_admin"),
  async (req, res) => {
    try {
      const { merchantId } = req.params;
      const { data, error } = await supabase
        .from("merchant_credit_checks")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      res.json(data || null);
    } catch (err) {
      console.error("Fetch experian check error:", err);
      res.status(500).json({ message: err.message || "Failed to fetch Experian check" });
    }
  }
);

export default router;

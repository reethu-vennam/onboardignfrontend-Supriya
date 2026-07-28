import { sendEmail } from "../utils/sendEmail.js";
import { supabase } from "../config/supabase.js";

/* ========================================
   Allowed Modules
======================================== */
const allowedModules = [
  "merchant_onboarding",
  "payments",
  "authentication",
  "inventory",
  "orders",
  "reports",
  "kyc",
  "settlement",
  "customer_portal",
];

/* ========================================
   CREATE TICKET (ADMIN / SUPPORT)
======================================== */
export const createNewTicket = async (req, res) => {
  try {
    const { module, reference_id, title, description, priority } = req.body;

    if (!module || !allowedModules.includes(module)) {
      return res.status(400).json({ message: "Invalid module" });
    }

    if (!title || !description) {
      return res.status(400).json({ message: "Title and description required" });
    }

    const { data, error } = await supabase
      .from("tickets")
      .insert([
        {
          module,
          reference_id,
          title,
          description,
          priority: priority || "medium",
          status: "open",
          created_by: req.user.id,
          assigned_to: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error("Admin ticket error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ========================================
   CREATE TICKET (MERCHANT + EMAIL)
======================================== */


export const createMerchantTicket = async (req, res) => {
  try {
    //const { merchant_id,module, title, description } = req.body;
const { merchant_id, title, description } = req.body;
    if (!merchant_id || !title || !description) {
      return res.status(400).json({
        message: "merchant_id, title and description required",
      });
    }

    // 1️⃣ Insert ticket
    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert([
        {
         // module: "merchant_onboarding",
        // module,
        module: "merchant_onboarding", 
        title,
          description,
          priority: "medium",
          status: "open",
          created_by: merchant_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // 2️⃣ Get merchant email from merchant_profiles
    const { data: merchant, error: merchantError } = await supabase
      .from("merchant_profiles")
      .select("email, full_name")
      .eq("user_id", merchant_id)
      .single();

    if (merchantError) {
      console.error("Merchant fetch error:", merchantError);
    }

    // 3️⃣ Send email
    if (merchant?.email) {
    await sendEmail(
  merchant.email,
  "🎫 Your Support Ticket Has Been Created - SabbPe",
  `
  <div style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:40px 0;">
          
          <!-- Main Card -->
          <table width="600" cellpadding="0" cellspacing="0" 
            style="background:#ffffff;border-radius:12px;box-shadow:0 8px 20px rgba(0,0,0,0.08);overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 30px;color:#ffffff;">
                <h2 style="margin:0;">SabbPe Support</h2>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:30px;">
                <h3 style="margin-top:0;color:#333;">Hello ${merchant.full_name || "Merchant"},</h3>
                
                <p style="color:#555;font-size:15px;">
                  Your support ticket has been successfully created.
                  Our team will review your issue and respond shortly.
                </p>

                <!-- Ticket Box -->
                <div style="margin:20px 0;padding:20px;border-radius:10px;background:#f9fafb;border:1px solid #e5e7eb;">
                  <p style="margin:5px 0;"><strong>Ticket ID:</strong> ${ticket.id}</p>
                  <p style="margin:5px 0;"><strong>Title:</strong> ${ticket.title}</p>
                  <p style="margin:5px 0;"><strong>Status:</strong> 
                    <span style="color:#4f46e5;font-weight:bold;">OPEN</span>
                  </p>
                </div>

                <p style="color:#555;font-size:14px;">
                  You will receive updates whenever the status changes.
                </p>

                <!-- CTA Button -->
                <div style="margin-top:25px;text-align:center;">
                  <a href="https://your-merchant-portal-link.com"
                     style="display:inline-block;padding:12px 24px;
                            background:linear-gradient(90deg,#4f46e5,#7c3aed);
                            color:#ffffff;text-decoration:none;
                            border-radius:6px;font-weight:bold;">
                    View My Tickets
                  </a>
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f3f4f6;padding:20px;text-align:center;font-size:12px;color:#777;">
                © ${new Date().getFullYear()} SabbPe. All rights reserved.<br/>
                This is an automated email. Please do not reply.
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </div>
  `
);

      console.log("📧 Email sent to merchant:", merchant.email);
    } else {
      console.log("⚠ Merchant email not found");
    }

    res.status(201).json(ticket);
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ message: error.message });
  }
};


/* ========================================
   GET TICKETS (Role Based)
======================================== */
// export const getTickets = async (req, res) => {
//   try {
//     const userRole = req.user.role;
//     const userId = req.user.id;
//     const { page = 1, limit = 10, status, module } = req.query;

//     let query = supabase
//       .from("tickets")
//       .select("*", { count: "exact" });

//     // Support users see only assigned tickets
//     if (!(userRole === "super_admin" || userRole === "admin")) {
//       query = query.eq("assigned_to", userId);
//     }

//     if (status) query = query.eq("status", status);
//     if (module) query = query.eq("module", module);

//     const from = (page - 1) * limit;
//     const to = from + limit - 1;

//     const { data, error, count } = await query
//       .range(from, to)
//       .order("created_at", { ascending: false });

//     if (error) throw error;

//     // Add merchant + last message info
//     const ticketsWithDetails = await Promise.all(
//       data.map(async (ticket) => {

//         // 🔹 Get last message
//         const { data: lastMessage } = await supabase
//           .from("ticket_messages")
//           .select("sender_role, created_at")
//           .eq("ticket_id", ticket.id)
//           .order("created_at", { ascending: false })
//           .limit(1)
//           .maybeSingle();

//         // 🔹 Get merchant profile
//         const { data: merchant } = await supabase
//           .from("merchant_profiles")
//           .select("full_name, email, business_name, user_id")
//           .eq("user_id", ticket.created_by)
//           .maybeSingle();

//         return {
//           ...ticket,
//           merchant,
//           last_message_role: lastMessage?.sender_role || null,
//           last_message_at: lastMessage?.created_at || null,
//         };
//       })
//     );

//     res.json({
//       total: count,
//       page: Number(page),
//       pages: Math.ceil(count / limit),
//       tickets: ticketsWithDetails,
//     });

//   } catch (error) {
//     console.error("Get tickets error:", error);
//     res.status(500).json({ message: error.message });
//   }
// };
export const getTickets = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;
    const { page = 1, limit = 10, status, module } = req.query;

    let query = supabase
      .from("tickets")
      .select("*", { count: "exact" });

    // Support sees only assigned tickets
    if (!(userRole === "super_admin" || userRole === "admin")) {
      query = query.eq("assigned_to", userId);
    }

    if (status) query = query.eq("status", status);
    if (module) query = query.eq("module", module);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
      .range(from, to)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // ✅ ADD MERCHANT DETAILS HERE
    const ticketsWithDetails = await Promise.all(
      data.map(async (ticket) => {

        // get merchant details
        // const { data: merchant } = await supabase
        //   .from("merchant_profiles")
        //   .select("full_name, email, phone")
        //   .eq("user_id", ticket.created_by)
        //   .maybeSingle();
        const { data: merchant } = await supabase
  .from("merchant_profiles")
  .select("*")
  .eq("user_id", ticket.created_by)
  .maybeSingle();

        // get last message
        const { data: lastMessage } = await supabase
          .from("ticket_messages")
          .select("sender_role, created_at")
          .eq("ticket_id", ticket.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...ticket,

          // 👇 IMPORTANT (this fixes your issue)
          // merchant_name: merchant?.full_name || null,
          // merchant_email: merchant?.email || null,
          // merchant_phone: merchant?.phone || null,
          merchant_name: merchant?.full_name || null,
merchant_email: merchant?.email || null,
// merchant_phone: merchant?.phone_number || merchant?.mobile || null,
merchant_phone: merchant?.mobile_number || null,
          last_message_role: lastMessage?.sender_role || null,
          last_message_at: lastMessage?.created_at || null,
        };
      })
    );

    res.json({
      total: count,
      page: Number(page),
      pages: Math.ceil(count / limit),
      tickets: ticketsWithDetails,
    });

  } catch (error) {
    console.error("Get tickets error:", error);
    res.status(500).json({ message: error.message });
  }
};

/* ========================================
   ASSIGN TICKET
======================================== */
export const assignTicket = async (req, res) => {
  try {
    const { ticketId, userId } = req.body;

    const { data, error } = await supabase
      .from("tickets")
      .update({
        assigned_to: userId,
        status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ========================================
   UPDATE STATUS (STRICT WORKFLOW + EMAIL)
======================================== */


export const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId, status } = req.body;

    if (!ticketId || !status) {
      return res.status(400).json({ message: "ticketId and status are required" });
    }

    const { data: ticket, error: fetchError } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (fetchError || !ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const role = req.user.role;

    // ✅ Lifecycle rules
    const allowedTransitions = {
      open: ["assigned"],
      assigned: ["in_progress"],
      in_progress: ["resolved"],
      resolved: ["closed"],
      closed: [],
    };

    if (!allowedTransitions[ticket.status]?.includes(status)) {
      return res.status(400).json({
        message: `Invalid transition from ${ticket.status} to ${status}`,
      });
    }

    // ✅ Role restrictions
    if (status === "in_progress" && role !== "support") {
      return res.status(403).json({ message: "Only support can start work" });
    }

    if (status === "resolved" && role !== "support") {
      return res.status(403).json({ message: "Only support can resolve" });
    }

    if (status === "closed" && role !== "admin" && role !== "super_admin") {
      return res.status(403).json({ message: "Only admin can close ticket" });
    }

    const { data: updated, error } = await supabase
      .from("tickets")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId)
      .select()
      .single();
      
      
      

    if (error) throw error;
  

    res.json(updated);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
/* ========================================
   DASHBOARD STATS
======================================== */
export const getTicketStats = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tickets")
      .select("status");

    if (error) throw error;

    const stats = {
      total: data.length,
      open: 0,
      assigned: 0,
      in_progress: 0,
      resolved: 0,
      waiting_customer: 0,
      closed: 0,
    };

    data.forEach((ticket) => {
      stats[ticket.status]++;
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
/* ========================================
   TEST EMAIL
======================================== */
export const testEmail = async (req, res) => {
  console.log("🧪 TEST EMAIL ENDPOINT CALLED");
  console.log("🧪 EMAIL_USER:", process.env.EMAIL_USER);
  console.log("🧪 EMAIL_PASS exists:", !!process.env.EMAIL_PASS);

  const result = await sendEmail(
    "reethuvennam273@gmail.com", // Your test email address
    "Test Email From SabbPe",
    "<h1>Email system working</h1><p>This is a test email from SabbPe.</p>"
  );

  console.log("🧪 Email result:", result);

  if (result.success) {
    res.send("Email sent successfully: " + result.message);
  } else {
    res.send("Email failed: " + result.error);
  }
};

/* ========================================
   GET MERCHANT TICKETS
======================================== */
export const getMerchantTickets = async (req, res) => {
  try {
    const { merchant_id } = req.params;

    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("created_by", merchant_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ========================================
   GET MERCHANT TICKET MESSAGES
======================================== */
export const getMerchantTicketMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { merchant_id } = req.query;

    if (!merchant_id) {
      return res.status(400).json({ message: "merchant_id required" });
    }

    // Verify merchant owns this ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, created_by")
      .eq("id", ticketId)
      .eq("created_by", merchant_id)
      .single();

    if (ticketError || !ticket) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { data, error } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* ========================================
   SEND MERCHANT TICKET MESSAGE
======================================== */
export const sendMerchantTicketMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { merchant_id, message } = req.body;

    if (!merchant_id || !message) {
      return res.status(400).json({ message: "merchant_id and message required" });
    }

    // Verify merchant owns this ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, created_by")
      .eq("id", ticketId)
      .eq("created_by", merchant_id)
      .single();

    if (ticketError || !ticket) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { data, error } = await supabase
      .from("ticket_messages")
      .insert([
        {
          ticket_id: ticketId,
          sender_id: merchant_id,
          sender_role: "merchant",
          message,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// ============================================
// GET MERCHANT REVIEW DETAILS
// ============================================
export const getMerchantReviewDetails = async (req, res) => {
  try {
    const { merchant_id } = req.params;

    const { data, error } = await supabase
      .from("merchant_profiles")
      .select("*")
      .eq("user_id", merchant_id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ============================================
// APPROVE / REJECT MERCHANT
// ============================================
export const reviewMerchant = async (req, res) => {
  try {
    const { merchant_id, status, review_notes } = req.body;

    if (!merchant_id || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid request data" });
    }

    console.log(`🔍 reviewMerchant called: merchant_id=${merchant_id}, status=${status}`);

    /* ==============================
       1️⃣ Get Merchant Profile
       Try user_id first, fall back to profile id
    =============================== */
    let profile;
    
    // Try by user_id first
    const { data: profileByUserId, error: e1 } = await supabase
      .from("merchant_profiles")
      .select("*")
      .eq("user_id", merchant_id)
      .maybeSingle();

    if (profileByUserId) {
      profile = profileByUserId;
      console.log(`✅ Found merchant by user_id: ${profile.id}`);
    } else {
      // Fall back to profile id
      const { data: profileById, error: e2 } = await supabase
        .from("merchant_profiles")
        .select("*")
        .eq("id", merchant_id)
        .maybeSingle();
      
      if (profileById) {
        profile = profileById;
        console.log(`✅ Found merchant by profile id: ${profile.id}`);
      } else {
        console.error(`❌ Merchant not found for id: ${merchant_id}`, e1, e2);
        return res.status(404).json({ message: "Merchant not found" });
      }
    }

    if (!profile) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    /* ==============================
       2️⃣ Update Merchant Profile
       NOTE: Support "approval" means KYC is verified and we send to bank.
       Only the Bank Module sets the final "approved" status.
       Support "rejection" directly rejects the merchant.
    =============================== */

    // When support rejects → reject immediately
    if (status === "rejected") {
      const { error: updateError } = await supabase
        .from("merchant_profiles")
        .update({
          onboarding_status: "rejected",
          rejection_reason: review_notes,
          reviewed_by: req.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (updateError) throw updateError;
    } else {
      // When support approves → all merchants require CPV before bank
      const { error: updateError } = await supabase
        .from("merchant_profiles")
        .update({
          onboarding_status: "cpv_pending",
          cpv_status: "pending",
          rejection_reason: null,
          reviewed_by: req.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (updateError) throw updateError;
    }

    const newOnboardingStatus = status === "approved" ? "cpv_pending" : "rejected"; // kept for response message below

    /* ==============================
       2b️⃣ Update merchant_kyc table
       kyc_status = "verified" when support approves
       kyc_status = "rejected" when support rejects
    =============================== */
    const kycStatus = status === "approved" ? "verified" : "rejected";

    const { error: kycError } = await supabase
      .from("merchant_kyc")
      .update({
        kyc_status: kycStatus,
        review_notes: review_notes || null,
        reviewed_by_admin: req.user.id,
        verified_at: status === "approved" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", profile.id);

    if (kycError) {
      // Log but don't fail — merchant_kyc row may not exist in all cases
      console.warn("⚠ KYC update warning:", kycError.message);
    }

    /* ==============================
       3️⃣ Update Onboarding Ticket (If Exists)
    =============================== */
    const { data: tickets, error: ticketError } = await supabase
      .from("tickets")
      .select("*")
      .eq("created_by", profile.user_id)
      .eq("module", "merchant_onboarding")
      .order("created_at", { ascending: false })
      .limit(1);

    if (ticketError) throw ticketError;

    if (tickets && tickets.length > 0) {
      const onboardingTicket = tickets[0];

      // When support approves → ticket stays open, bank still needs to review
      // When support rejects → ticket moves to waiting_customer (merchant to resubmit)
      const newStatus =
        status === "approved" ? "in_progress" : "waiting_customer";

      await supabase
        .from("tickets")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", onboardingTicket.id);

      console.log("✅ Onboarding ticket updated");
    } else {
      console.log("⚠ No onboarding ticket found, skipping ticket update");
    }

    /* ==============================
       4️⃣ Send Email Notification
    =============================== */
    const subject =
      status === "approved"
        ? "✅ Your KYC Has Been Verified - SabbPe"
        : "❌ Merchant Account Review Update - SabbPe";

    const message =
      status === "approved"
        ? `
  <div style="margin:0;padding:0;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:50px 20px;">
          <table width="650" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.1);overflow:hidden;border:1px solid #e2e8f0;">

            <!-- Header with Logo/Icon -->
            <tr>
              <td style="background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);padding:40px 40px 30px;color:#ffffff;text-align:center;">
                <div style="width:80px;height:80px;background:#ffffff;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,0.15);">
                  <span style="font-size:36px;">✅</span>
                </div>
                <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">KYC Verification Complete</h1>
                <p style="margin:10px 0 0;font-size:16px;opacity:0.9;">Your documents have been successfully verified</p>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 20px;color:#1f2937;font-size:24px;font-weight:600;">
                  Welcome aboard, ${profile.full_name || "Merchant"}! 🎉
                </h2>

                <p style="color:#4b5563;font-size:16px;line-height:1.6;margin-bottom:30px;">
                  Great news! Your KYC documents have been thoroughly reviewed and <strong>approved</strong> by our verification team.
                  You're now one step closer to becoming a fully verified SabbPe merchant.
                </p>

                <!-- Status Card -->
                <div style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border-radius:16px;padding:30px;margin:30px 0;border:2px solid #bfdbfe;position:relative;overflow:hidden;">
                  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:linear-gradient(90deg,#3b82f6,#1d4ed8);"></div>

                  <div style="display:flex;align-items:center;margin-bottom:20px;">
                    <div style="width:48px;height:48px;background:#3b82f6;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-right:16px;">
                      <span style="color:#ffffff;font-size:24px;">📋</span>
                    </div>
                    <div>
                      <h3 style="margin:0;color:#1f2937;font-size:18px;font-weight:600;">KYC Status</h3>
                      <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Verification completed</p>
                    </div>
                  </div>

                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-top:20px;border:1px solid #e5e7eb;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Current Status:</span>
                      <span style="background:#10b981;color:#ffffff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">VERIFIED ✅</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Next Step:</span>
                      <span style="color:#1f2937;font-weight:600;">Shop Verification (CPV)</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="color:#6b7280;font-weight:500;">Business:</span>
                      <span style="color:#1f2937;font-weight:600;">${profile.business_name}</span>
                    </div>
                  </div>
                </div>

                <!-- Next Steps -->
                <div style="background:#f8fafc;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;display:flex;align-items:center;">
                    <span style="width:32px;height:32px;background:#3b82f6;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-right:12px;">
                      <span style="color:#ffffff;font-size:16px;">📹</span>
                    </span>
                    What's Next?
                  </h3>

                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-bottom:20px;border-left:4px solid #3b82f6;">
                    <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                      <strong>Complete Shop Verification (CPV)</strong> by recording a short video of your business premises.
                      This helps us ensure the security and legitimacy of your merchant account.
                    </p>
                  </div>

                  <p style="color:#6b7280;font-size:14px;margin:0;">
                    Log in to your merchant dashboard and navigate to the onboarding section to record your CPV video.
                    This final step will complete your verification process.
                  </p>
                </div>

                <!-- CTA Button -->
                <div style="text-align:center;margin:40px 0;">
                  <a href="#"
                     style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);
                            color:#ffffff;text-decoration:none;padding:16px 32px;
                            border-radius:12px;font-weight:600;font-size:16px;
                            box-shadow:0 4px 12px rgba(59,130,246,0.3);
                            transition:all 0.3s ease;">
                    Access Merchant Dashboard
                  </a>
                </div>

                <p style="color:#9ca3af;font-size:14px;text-align:center;margin:20px 0 0;">
                  Need help? Contact our support team at <a href="mailto:support@sabbpe.com" style="color:#3b82f6;text-decoration:none;">support@sabbpe.com</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:30px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <div style="margin-bottom:20px;">
                  <img src="https://via.placeholder.com/120x40/3b82f6/ffffff?text=SabbPe" alt="SabbPe Logo" style="height:40px;">
                </div>
                <p style="margin:0;color:#6b7280;font-size:14px;">
                  © ${new Date().getFullYear()} SabbPe. All rights reserved.<br/>
                  This is an automated message. Please do not reply.
                </p>
                <div style="margin-top:20px;">
                  <a href="#" style="color:#3b82f6;text-decoration:none;margin:0 10px;font-size:14px;">Privacy Policy</a>
                  <a href="#" style="color:#3b82f6;text-decoration:none;margin:0 10px;font-size:14px;">Terms of Service</a>
                  <a href="#" style="color:#3b82f6;text-decoration:none;margin:0 10px;font-size:14px;">Support</a>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
  `
    : `
  <div style="margin:0;padding:0;background:linear-gradient(135deg,#f8fafc 0%,#fee2e2 20%,#fef2f2 100%);font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:50px 20px;">
          <table width="650" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.1);overflow:hidden;border:1px solid #e2e8f0;">

            <!-- Header with Logo/Icon -->
            <tr>
              <td style="background:linear-gradient(135deg,#dc2626 0%,#b91c1c 100%);padding:40px 40px 30px;color:#ffffff;text-align:center;">
                <div style="width:80px;height:80px;background:#ffffff;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,0.15);">
                  <span style="font-size:36px;">⚠️</span>
                </div>
                <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Application Review</h1>
                <p style="margin:10px 0 0;font-size:16px;opacity:0.9;">Additional information required</p>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 20px;color:#1f2937;font-size:24px;font-weight:600;">
                  Hello ${profile.full_name || "Merchant"},
                </h2>

                <p style="color:#4b5563;font-size:16px;line-height:1.6;margin-bottom:30px;">
                  After reviewing your submission, we need some additional information to complete your merchant verification process.
                  Your application has been placed on hold pending the requested updates.
                </p>

                <!-- Status Card -->
                <div style="background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%);border-radius:16px;padding:30px;margin:30px 0;border:2px solid #fecaca;position:relative;overflow:hidden;">
                  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:linear-gradient(90deg,#dc2626,#b91c1c);"></div>

                  <div style="display:flex;align-items:center;margin-bottom:20px;">
                    <div style="width:48px;height:48px;background:#dc2626;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-right:16px;">
                      <span style="color:#ffffff;font-size:24px;">📋</span>
                    </div>
                    <div>
                      <h3 style="margin:0;color:#1f2937;font-size:18px;font-weight:600;">Application Status</h3>
                      <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Review in progress</p>
                    </div>
                  </div>

                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-top:20px;border:1px solid #e5e7eb;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Current Status:</span>
                      <span style="background:#dc2626;color:#ffffff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">UNDER REVIEW</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Business:</span>
                      <span style="color:#1f2937;font-weight:600;">${profile.business_name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="color:#6b7280;font-weight:500;">Next Step:</span>
                      <span style="color:#1f2937;font-weight:600;">Update Documents</span>
                    </div>
                  </div>
                </div>

                <!-- Review Details -->
                <div style="background:#f8fafc;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;display:flex;align-items:center;">
                    <span style="width:32px;height:32px;background:#dc2626;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-right:12px;">
                      <span style="color:#ffffff;font-size:16px;">📝</span>
                    </span>
                    Review Notes
                  </h3>

                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-bottom:20px;border-left:4px solid #dc2626;">
                    <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                      <strong>Reason for review:</strong> ${review_notes || "Additional documentation or clarification required"}
                    </p>
                  </div>

                  <p style="color:#6b7280;font-size:14px;margin:0;">
                    Please update your documents and resubmit for review. Our team will process your updated application as quickly as possible.
                  </p>
                </div>

                <!-- Next Steps -->
                <div style="background:#ffffff;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;">What to do next:</h3>

                  <div style="display:flex;flex-direction:column;gap:15px;">
                    <div style="display:flex;align-items:flex-start;">
                      <div style="width:24px;height:24px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;margin-top:2px;flex-shrink:0;">
                        <span style="color:#ffffff;font-size:12px;font-weight:600;">1</span>
                      </div>
                      <p style="margin:0;color:#4b5563;font-size:14px;">Log in to your merchant dashboard</p>
                    </div>
                    <div style="display:flex;align-items:flex-start;">
                      <div style="width:24px;height:24px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;margin-top:2px;flex-shrink:0;">
                        <span style="color:#ffffff;font-size:12px;font-weight:600;">2</span>
                      </div>
                      <p style="margin:0;color:#4b5563;font-size:14px;">Navigate to your application status</p>
                    </div>
                    <div style="display:flex;align-items:flex-start;">
                      <div style="width:24px;height:24px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;margin-top:2px;flex-shrink:0;">
                        <span style="color:#ffffff;font-size:12px;font-weight:600;">3</span>
                      </div>
                      <p style="margin:0;color:#4b5563;font-size:14px;">Update the required documents</p>
                    </div>
                    <div style="display:flex;align-items:flex-start;">
                      <div style="width:24px;height:24px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:12px;margin-top:2px;flex-shrink:0;">
                        <span style="color:#ffffff;font-size:12px;font-weight:600;">✓</span>
                      </div>
                      <p style="margin:0;color:#4b5563;font-size:14px;">Resubmit for review</p>
                    </div>
                  </div>
                </div>

                <!-- CTA Button -->
                <div style="text-align:center;margin:40px 0;">
                  <a href="#"
                     style="display:inline-block;background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);
                            color:#ffffff;text-decoration:none;padding:16px 32px;
                            border-radius:12px;font-weight:600;font-size:16px;
                            box-shadow:0 4px 12px rgba(59,130,246,0.3);
                            transition:all 0.3s ease;">
                    Update Application
                  </a>
                </div>

                <p style="color:#9ca3af;font-size:14px;text-align:center;margin:20px 0 0;">
                  Need assistance? Contact our support team at <a href="mailto:support@sabbpe.com" style="color:#3b82f6;text-decoration:none;">support@sabbpe.com</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:30px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <div style="margin-bottom:20px;">
                  <img src="https://via.placeholder.com/120x40/dc2626/ffffff?text=SabbPe" alt="SabbPe Logo" style="height:40px;">
                </div>
                <p style="margin:0;color:#6b7280;font-size:14px;">
                  © ${new Date().getFullYear()} SabbPe. All rights reserved.<br/>
                  This is an automated message. Please do not reply.
                </p>
                <div style="margin-top:20px;">
                  <a href="#" style="color:#dc2626;text-decoration:none;margin:0 10px;font-size:14px;">Privacy Policy</a>
                  <a href="#" style="color:#dc2626;text-decoration:none;margin:0 10px;font-size:14px;">Terms of Service</a>
                  <a href="#" style="color:#dc2626;text-decoration:none;margin:0 10px;font-size:14px;">Support</a>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
        `;

    if (profile.email) {
      sendEmail(profile.email, subject, message)
        .then(() => console.log("📧 Email sent to:", profile.email))
        .catch(err => console.warn("⚠ Review email failed (non-blocking):", err?.message));
    }
    // Internal notification to onboarding team on KYC approval
    if (status === "approved") {
      const internalSubject = `✅ KYC Approved: ${profile.business_name || profile.full_name} — Action Required`;
      const internalMessage = `
        <div style="font-family:Arial,sans-serif;max-width:800px;margin:auto">
          <div style="background:#1a56db;padding:20px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">✅ New Merchant KYC Approved</h2>
            <p style="color:#cce0ff;margin:4px 0 0">Please complete onboarding for the merchant below.</p>
          </div>
          <div style="border:1px solid #ddd;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <h3 style="color:#1a56db">👤 Personal Details</h3>
            <table cellpadding="6" style="width:100%">
              <tr><td><strong>Full Name</strong></td><td>${profile.full_name || '-'}</td></tr>
              <tr><td><strong>Email</strong></td><td>${profile.email || '-'}</td></tr>
              <tr><td><strong>Mobile</strong></td><td>${profile.mobile_number || '-'}</td></tr>
              <tr><td><strong>PAN</strong></td><td>${profile.pan_number || '-'}</td></tr>
              <tr><td><strong>Aadhaar</strong></td><td>${profile.aadhaar_number || '-'}</td></tr>
            </table>
            <h3 style="color:#1a56db">🏢 Business Details</h3>
            <table cellpadding="6" style="width:100%">
              <tr><td><strong>Business Name</strong></td><td>${profile.business_name || '-'}</td></tr>
              <tr><td><strong>Entity Type</strong></td><td>${profile.entity_type || '-'}</td></tr>
              <tr><td><strong>GST Number</strong></td><td>${profile.gst_number || '-'}</td></tr>
              <tr><td><strong>Application ID</strong></td><td>${profile.application_id || '-'}</td></tr>
              <tr><td><strong>UPI VPA</strong></td><td>${profile.upi_vpa || '-'}</td></tr>
            </table>
            <h3 style="color:#1a56db">📍 Address</h3>
            <table cellpadding="6" style="width:100%">
              <tr><td><strong>Registration Details</strong></td><td>${JSON.stringify(profile.registration_details || {})}</td></tr>
            </table>
            <h3 style="color:#1a56db">📦 Selected Products</h3>
            <table cellpadding="6" style="width:100%">
              <tr><td>${JSON.stringify(profile.selected_products || [])}</td></tr>
            </table>
            <h3 style="color:#1a56db">📄 Documents</h3>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
              <tr style="background:#f0f0f0"><th>Type</th><th>Link</th></tr>
              <tr><td>PAN Card</td><td>${profile.pan_card_url ? `<a href="${profile.pan_card_url}">View</a>` : '-'}</td></tr>
              <tr><td>Aadhaar Card</td><td>${profile.aadhaar_card_url ? `<a href="${profile.aadhaar_card_url}">View</a>` : '-'}</td></tr>
              <tr><td>Business Proof</td><td>${profile.business_proof_url ? `<a href="${profile.business_proof_url}">View</a>` : '-'}</td></tr>
              <tr><td>Cancelled Cheque</td><td>${profile.cancelled_cheque_url ? `<a href="${profile.cancelled_cheque_url}">View</a>` : '-'}</td></tr>
            </table>
            <h3 style="color:#1a56db">📋 Other Info</h3>
            <table cellpadding="6" style="width:100%">
              <tr><td><strong>Merchant ID</strong></td><td>${profile.id}</td></tr>
              <tr><td><strong>Submitted At</strong></td><td>${profile.submitted_at || '-'}</td></tr>
              <tr><td><strong>Agreement Signed</strong></td><td>${profile.agreement_signed ? 'Yes' : 'No'}</td></tr>
              <tr><td><strong>Monthly Cost</strong></td><td>₹${profile.total_monthly_cost || 0}</td></tr>
              <tr><td><strong>One-time Cost</strong></td><td>₹${profile.total_onetime_cost || 0}</td></tr>
            </table>
            <br>
            <p style="color:#888;font-size:12px">Automated internal notification — SabbPe Onboarding System</p>
          </div>
        </div>`;

      setTimeout(() => {
  sendEmail("vendor.onboarding@sabbpe.com", internalSubject, internalMessage)
    .then(() => console.log("📧 Internal onboarding notification sent to vendor.onboarding@sabbpe.com"))
    .catch(err => console.warn("⚠ Internal notification failed (non-blocking):", err?.message));
}, 3000);
    }
    /* ==============================
       5️⃣ Final Response
    =============================== */
    res.json({ 
      message: status === "approved" 
        ? "KYC verified. Merchant sent to bank for approval." 
        : "Merchant rejected successfully",
      onboarding_status: newOnboardingStatus,
      kyc_status: kycStatus
    });

  } catch (error) {
    console.error("Review error:", error);
    res.status(500).json({ message: error.message });
  }
};



export const getMerchantReviewData = async (req, res) => {
  try {
    const { merchantId } = req.params;

    if (!merchantId) {
      return res.status(400).json({ message: "Merchant ID required" });
    }

    // 🔐 Support access check
    if (req.user.role === "support") {
      const { data: tickets, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("created_by", merchantId)
        .eq("assigned_to", req.user.id)
        .eq("module", "merchant_onboarding")
        .limit(1);

      if (ticketError) throw ticketError;

      if (!tickets || tickets.length === 0) {
        return res.status(403).json({
          message: "You are not authorized to view this merchant",
        });
      }
    }

    // ✅ 1️⃣ Get merchant profile (SAFE VERSION)
    const { data: profile, error: profileError } = await supabase
      .from("merchant_profiles")
      .select("*")
      .eq("user_id", merchantId)
      .maybeSingle();   // 🔥 IMPORTANT CHANGE

    if (profileError) throw profileError;

    if (!profile) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    // ✅ 2️⃣ Get documents safely
    const { data: documents, error: docsError } = await supabase
      .from("merchant_documents")
      .select("*")
      .eq("merchant_id", profile.id);

    if (docsError) throw docsError;

    const documentsWithUrls = (documents || []).map((doc) => {
      const { data } = supabase.storage
        .from("merchant-documents")
        .getPublicUrl(doc.file_path);

      return {
        ...doc,
        public_url: data?.publicUrl || null,
      };
    });

    res.json({
      profile,
      documents: documentsWithUrls,
    });

  } catch (error) {
    console.error("Merchant review fetch error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getTicketMessages = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const { data, error } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const sendTicketMessage = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;

    const { data, error } = await supabase
      .from("ticket_messages")
      .insert([
        {
          ticket_id: ticketId,
          sender_id: req.user.id,
          sender_role: req.user.role,
          message,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getKYCList = async (req, res) => {
  try {
    const { data: merchants, error } = await supabase
      .from("merchant_profiles")
      .select("id, user_id, full_name, email, onboarding_status, pan_number, aadhaar_number, business_name, gst_number, entity_type, mobile_number, onboarding_score")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    if (!merchants) return res.json([]);

    const merchantsWithScore = merchants.map((merchant) => {
      return { ...merchant, score: merchant.onboarding_score || 0 };
    });

    res.json(merchantsWithScore);
  } catch (error) {
    console.error("getKYCList error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
export const getAssignedKYCForSupport = async (req, res) => {
  try {
    const supportId = req.user.id;

    // 1️⃣ Get assigned onboarding tickets
    const { data: tickets, error: ticketError } = await supabase
      .from("tickets")
      .select("id, created_by")
      .eq("module", "merchant_onboarding")
      .eq("assigned_to", supportId);

    if (ticketError) throw ticketError;

    if (!tickets || tickets.length === 0) {
      return res.json([]);
    }
const merchantIds = [...new Set(tickets.map((t) => t.created_by))];
    // 2️⃣ Extract merchant IDs
    //const merchantIds = tickets.map((t) => t.created_by);

    // 3️⃣ Fetch merchant profiles
    const { data: merchants, error: merchantError } = await supabase
      .from("merchant_profiles")
      .select("id, user_id, full_name, email, onboarding_status, pan_number, aadhaar_number, business_name, gst_number, entity_type, mobile_number")
      .in("user_id", merchantIds);

    if (merchantError) throw merchantError;

    if (!merchants) return res.json([]);

    const merchantsWithScore = await Promise.all(
      merchants.map(async (merchant) => {
        let score = 0;

        const profileFields = ["full_name", "email", "mobile_number", "pan_number", "aadhaar_number", "business_name", "gst_number", "entity_type"];
        const filledFields = profileFields.filter((f) => merchant[f] && merchant[f].trim() !== "");
        score += Math.round((filledFields.length / profileFields.length) * 30);

        const { data: docs } = await supabase
          .from("merchant_documents")
          .select("id, status")
          .eq("merchant_id", merchant.id);
        if (docs && docs.length > 0) {
          const verified = docs.filter((d) => d.status === "verified").length;
          score += Math.round((verified / docs.length) * 25);
        }

        const { data: persons } = await supabase
          .from("merchant_persons")
          .select("id, pan_number")
          .eq("merchant_id", merchant.id);
        if (persons && persons.length > 0) {
          const withPan = persons.filter((p) => p.pan_number && p.pan_number.trim() !== "").length;
          score += Math.round((withPan / persons.length) * 20);
        }

        const { data: bank } = await supabase
          .from("merchant_bank_details")
          .select("id, account_number, ifsc_code")
          .eq("merchant_id", merchant.id)
          .maybeSingle();
        if (bank) {
          if (bank.account_number) score += 8;
          if (bank.ifsc_code) score += 7;
        }

        const { data: kyc } = await supabase
          .from("merchant_kyc")
          .select("video_kyc_completed, selfie_file_path")
          .eq("merchant_id", merchant.id)
          .maybeSingle();
        if (kyc) {
          if (kyc.video_kyc_completed) score += 5;
          if (kyc.selfie_file_path) score += 5;
        }

        return { ...merchant, score: Math.min(score, 100) };
      })
    );

    res.json(merchantsWithScore);

  } catch (error) {
    console.error("Assigned KYC error:", error);
    res.status(500).json({ message: error.message });
  }
};
// ============================================
// VERIFY CPV — sets cpv_verified + pending_bank_approval
// ============================================
export const verifyCPV = async (req, res) => {
  try {
    const { merchant_id } = req.body;

    if (!merchant_id) {
      return res.status(400).json({ message: "merchant_id required" });
    }

    // Get merchant profile
    const { data: profile, error: profileError } = await supabase
      .from("merchant_profiles")
      .select("*")
      .eq("user_id", merchant_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    if (profile.onboarding_status !== "cpv_pending") {
      return res.status(400).json({
        message: `Cannot verify CPV from status: ${profile.onboarding_status}`
      });
    }

    if (!profile.cpv_video_path) {
      return res.status(400).json({
        message: "Merchant has not submitted CPV video yet"
      });
    }

    // Update to cpv_verified and send to bank
    const { error: updateError } = await supabase
      .from("merchant_profiles")
      .update({
        cpv_status: "cpv_verified",
        cpv_verified_at: new Date().toISOString(),
        cpv_verified_by: req.user.id,
        onboarding_status: "pending_bank_approval",
        updated_at: new Date().toISOString()
      })
      .eq("user_id", merchant_id);

    if (updateError) throw updateError;

    // Audit log — non-blocking, ignore if table doesn't exist or has schema mismatch
    try {
      await supabase.from("support_kyc_actions").insert({
        support_staff_id: req.user.id,
        merchant_id: profile.id,
        action: "cpv_verify",
        decision: "cpv_verified",
        notes: "CPV verified and sent to bank"
      });
    } catch (auditErr) {
      console.warn("⚠ Audit log warning (non-blocking):", auditErr?.message);
    }

    // Send email notification for CPV verification
    const subject = "✅ Your CPV Video Has Been Verified - SabbPe";
    const message = `
  <div style="margin:0;padding:0;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);font-family:'Segoe UI',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:50px 20px;">
          <table width="650" cellpadding="0" cellspacing="0"
            style="background:#ffffff;border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.1);overflow:hidden;border:1px solid #e2e8f0;">

            <!-- Header with Logo/Icon -->
            <tr>
              <td style="background:linear-gradient(135deg,#8b5cf6 0%,#7c3aed 100%);padding:40px 40px 30px;color:#ffffff;text-align:center;">
                <div style="width:80px;height:80px;background:#ffffff;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,0.15);">
                  <span style="font-size:36px;">🎬</span>
                </div>
                <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">CPV Video Verified</h1>
                <p style="margin:10px 0 0;font-size:16px;opacity:0.9;">Your shop verification is complete</p>
              </td>
            </tr>

            <!-- Body Content -->
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 20px;color:#1f2937;font-size:24px;font-weight:600;">
                  Excellent work, ${profile.full_name || "Merchant"}! 🚀
                </h2>

                <p style="color:#4b5563;font-size:16px;line-height:1.6;margin-bottom:30px;">
                  Your CPV (Shop Verification) video has been <strong>approved</strong> by our admin team.
                  Your application has now been forwarded to our banking partner for final approval.
                </p>

                <!-- Status Card -->
                <div style="background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%);border-radius:16px;padding:30px;margin:30px 0;border:2px solid #bae6fd;position:relative;overflow:hidden;">
                  <div style="position:absolute;top:0;left:0;width:100%;height:4px;background:linear-gradient(90deg,#8b5cf6,#7c3aed);"></div>

                  <div style="display:flex;align-items:center;margin-bottom:20px;">
                    <div style="width:48px;height:48px;background:#8b5cf6;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-right:16px;">
                      <span style="color:#ffffff;font-size:24px;">✅</span>
                    </div>
                    <div>
                      <h3 style="margin:0;color:#1f2937;font-size:18px;font-weight:600;">CPV Status</h3>
                      <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">Video verification completed</p>
                    </div>
                  </div>

                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-top:20px;border:1px solid #e5e7eb;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">CPV Status:</span>
                      <span style="background:#10b981;color:#ffffff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;">VERIFIED ✅</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                      <span style="color:#6b7280;font-weight:500;">Next Step:</span>
                      <span style="color:#1f2937;font-weight:600;">Bank Approval (est. 15 mins)</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span style="color:#6b7280;font-weight:500;">Business:</span>
                      <span style="color:#1f2937;font-weight:600;">${profile.business_name}</span>
                    </div>
                  </div>
                </div>

                <!-- Next Steps -->
                <div style="background:#f8fafc;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;display:flex;align-items:center;">
                    <span style="width:32px;height:32px;background:#8b5cf6;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-right:12px;">
                      <span style="color:#ffffff;font-size:16px;">🏦</span>
                    </span>
                    Final Step: Bank Review
                  </h3>

                  <div style="background:#ffffff;border-radius:12px;padding:20px;margin-bottom:20px;border-left:4px solid #8b5cf6;">
                    <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
                      Your application is now under review by our banking partner.
                      This final approval typically takes about 15 minutes during business hours.
                    </p>
                  </div>

                  <p style="color:#6b7280;font-size:14px;margin:0;">
                    You'll receive a confirmation email once your account is fully activated and ready to accept payments.
                  </p>
                </div>

                <!-- Progress Indicator -->
                <div style="background:#ffffff;border-radius:16px;padding:30px;margin:30px 0;border:1px solid #e2e8f0;">
                  <h3 style="margin:0 0 20px;color:#1f2937;font-size:18px;font-weight:600;text-align:center;">Your Progress</h3>

                  <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">1</div>
                      <p style="margin:0;color:#6b7280;font-size:12px;">KYC Verified</p>
                    </div>
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">2</div>
                      <p style="margin:0;color:#6b7280;font-size:12px;">CPV Approved</p>
                    </div>
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#8b5cf6;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#ffffff;font-weight:600;">3</div>
                      <p style="margin:0;color:#1f2937;font-size:12px;font-weight:600;">Bank Review</p>
                    </div>
                    <div style="flex:1;text-align:center;">
                      <div style="width:40px;height:40px;background:#e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#9ca3af;font-weight:600;">4</div>
                      <p style="margin:0;color:#9ca3af;font-size:12px;">Activated</p>
                    </div>
                  </div>

                  <div style="width:100%;height:4px;background:#e5e7eb;border-radius:2px;margin-bottom:10px;">
                    <div style="width:75%;height:100%;background:linear-gradient(90deg,#10b981,#8b5cf6);border-radius:2px;"></div>
                  </div>
                  <p style="color:#6b7280;font-size:12px;text-align:center;margin:0;">75% Complete</p>
                </div>

                <p style="color:#9ca3af;font-size:14px;text-align:center;margin:20px 0 0;">
                  Questions? Reach out to our support team at <a href="mailto:support@sabbpe.com" style="color:#8b5cf6;text-decoration:none;">support@sabbpe.com</a>
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:30px 40px;text-align:center;border-top:1px solid #e2e8f0;">
                <div style="margin-bottom:20px;">
                  <img src="https://via.placeholder.com/120x40/8b5cf6/ffffff?text=SabbPe" alt="SabbPe Logo" style="height:40px;">
                </div>
                <p style="margin:0;color:#6b7280;font-size:14px;">
                  © ${new Date().getFullYear()} SabbPe. All rights reserved.<br/>
                  This is an automated message. Please do not reply.
                </p>
                <div style="margin-top:20px;">
                  <a href="#" style="color:#8b5cf6;text-decoration:none;margin:0 10px;font-size:14px;">Privacy Policy</a>
                  <a href="#" style="color:#8b5cf6;text-decoration:none;margin:0 10px;font-size:14px;">Terms of Service</a>
                  <a href="#" style="color:#8b5cf6;text-decoration:none;margin:0 10px;font-size:14px;">Support</a>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
        `;

    if (profile.email) {
      sendEmail(profile.email, subject, message)
        .then(() => console.log("📧 CPV verification email sent to:", profile.email))
        .catch(err => console.warn("⚠ CPV email failed (non-blocking):", err?.message));
    }

    res.json({
      success: true,
      message: "CPV verified. Application sent to bank for approval."
    });

  } catch (error) {
    console.error("CPV verify error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// REJECT CPV — merchant must re-record video
// ============================================
export const rejectCPV = async (req, res) => {
  try {
    const { merchant_id, reason } = req.body;

    if (!merchant_id || !reason) {
      return res.status(400).json({ message: "merchant_id and reason are required" });
    }

    const { data: profile, error: profileError } = await supabase
      .from("merchant_profiles")
      .select("id, onboarding_status")
      .eq("user_id", merchant_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    if (profile.onboarding_status !== "cpv_pending") {
      return res.status(400).json({
        message: `Cannot reject CPV from status: ${profile.onboarding_status}`
      });
    }

    // Reset CPV so merchant can re-record
    // Keep onboarding_status as cpv_pending so merchant knows they need to re-record
    const { error: updateError } = await supabase
      .from("merchant_profiles")
      .update({
        cpv_status: "cpv_rejected",
        cpv_video_path: null,          // clear old video
        cpv_submitted_at: null,
        cpv_rejection_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", merchant_id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: "CPV rejected. Merchant will be asked to re-record their shop video."
    });

  } catch (error) {
    console.error("CPV reject error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const getAllDocuments = async (req, res) => {
  try {
    const { status, document_type } = req.query;

    let query = supabase
      .from("merchant_documents")
      .select("id, merchant_id, document_type, file_name, file_path, status, rejection_reason, uploaded_at, verified_at, verified_by")
      .order("uploaded_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (document_type) query = query.eq("document_type", document_type);

    const { data: documents, error } = await query;

    if (error) throw error;

    if (!documents || documents.length === 0) return res.json([]);

    const merchantIds = [...new Set(documents.map((d) => d.merchant_id))];
    const { data: merchants } = await supabase
      .from("merchant_profiles")
      .select("id, full_name, business_name")
      .in("id", merchantIds);

    const merchantMap = {};
    if (merchants) {
      merchants.forEach((m) => {
        merchantMap[m.id] = m.business_name || m.full_name;
      });
    }

    const result = documents.map((doc) => {
      const { data } = supabase.storage
        .from("merchant-documents")
        .getPublicUrl(doc.file_path);

      return {
        ...doc,
        merchant_name: merchantMap[doc.merchant_id] || "Unknown",
        public_url: data?.publicUrl || null,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("getAllDocuments error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const reviewDocument = async (req, res) => {
  try {
    const { document_id, status, rejection_reason } = req.body;

    if (!document_id || !["verified", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid request. document_id and status (verified/rejected) required" });
    }

    if (status === "rejected" && !rejection_reason) {
      return res.status(400).json({ message: "rejection_reason required when rejecting" });
    }

    const updateData = {
      status,
      verified_at: new Date().toISOString(),
    };

    if (status === "rejected") {
      updateData.rejection_reason = rejection_reason;
    }

    const { data, error } = await supabase
      .from("merchant_documents")
      .update(updateData)
      .eq("id", document_id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, document: data });
  } catch (error) {
    console.error("reviewDocument error:", error);
    res.status(500).json({ message: error.message });
  }
};

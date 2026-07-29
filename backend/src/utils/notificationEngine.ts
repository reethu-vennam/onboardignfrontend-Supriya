import axios from "axios";
import { sendEmail } from "./sendEmail";

export type NotificationAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type NotificationMailRequest = {
  to: string;
  subject: string;
  htmlBody: string;
  attachments?: NotificationAttachment[];
};

export type NotificationMailResult = {
  sent: boolean;
  via: "notification-engine" | "smtp-fallback" | null;
  error?: string;
};

const getEngineConfig = (): { baseUrl: string; mailPath: string } | null => {
  const baseUrl = process.env.NOTIFICATIONS_ENGINE_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;

  const mailPath = process.env.NOTIFICATIONS_ENGINE_MAIL_PATH || "/api/mail/merchant-notify";
  return { baseUrl, mailPath };
};

const buildEnginePayload = (request: NotificationMailRequest) => {
  const payload: Record<string, unknown> = {
    to: request.to,
    subject: request.subject,
    htmlBody: request.htmlBody,
  };

  if (request.attachments?.length) {
    payload.attachments = request.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content.toString("base64"),
      contentType: attachment.contentType || "application/octet-stream",
    }));
  }

  return payload;
};

const formatEngineError = (error: unknown): string => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const status = error.response?.status;
  const data = error.response?.data;
  const detail =
    typeof data === "string"
      ? data
      : data && typeof data === "object"
        ? JSON.stringify(data)
        : error.message;

  return status ? `${status}: ${detail}` : error.message;
};

const sendViaNotificationEngine = async (
  request: NotificationMailRequest,
  config: { baseUrl: string; mailPath: string }
): Promise<void> => {
  const url = `${config.baseUrl}${config.mailPath}`;
  const payload = buildEnginePayload(request);
  const attachmentBytes = request.attachments?.reduce((sum, a) => sum + a.content.length, 0) ?? 0;

  await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 120000,
    maxBodyLength: 30 * 1024 * 1024,
    maxContentLength: 30 * 1024 * 1024,
  });

  console.log(
    `📧 Notification engine accepted mail to ${request.to}` +
      (attachmentBytes ? ` (${Math.round(attachmentBytes / 1024)}KB attachment)` : "")
  );
};

const sendViaSmtpFallback = async (request: NotificationMailRequest): Promise<boolean> => {
  return sendEmail(
    request.to,
    request.subject,
    request.htmlBody,
    (request.attachments || []).map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    }))
  );
};

/**
 * Sends email through the notification engine.
 * Falls back to backend SMTP when the engine endpoint is unavailable or rejects the request.
 */
export const sendMailViaNotificationEngine = async (
  request: NotificationMailRequest
): Promise<NotificationMailResult> => {
  const config = getEngineConfig();

  if (config) {
    try {
      await sendViaNotificationEngine(request, config);
      console.log("📧 Mail sent via notification engine:", request.to);
      return { sent: true, via: "notification-engine" };
    } catch (error) {
      const path = config.mailPath;
      const detail = formatEngineError(error);
      console.error(`❌ Notification engine failed for ${path}:`, detail);

      if (path === "/api/mail/send") {
        console.error(
          "💡 Hint: /api/mail/send expects { clientId, orderNumber, templateName }. " +
            "Use NOTIFICATIONS_ENGINE_MAIL_PATH=/api/mail/merchant-notify for onboarding ZIP emails."
        );
      }

      const allowFallback = process.env.NOTIFICATIONS_ENGINE_ALLOW_SMTP_FALLBACK !== "false";
      if (!allowFallback) {
        return {
          sent: false,
          via: null,
          error: `Notification engine failed: ${detail}`,
        };
      }

      console.warn("⚠️ Falling back to backend SMTP for:", request.to);
    }
  } else {
    console.warn("⚠️ NOTIFICATIONS_ENGINE_URL not set, using backend SMTP for:", request.to);
  }

  try {
    const sent = await sendViaSmtpFallback(request);
    if (!sent) {
      return {
        sent: false,
        via: null,
        error: "SMTP fallback failed. Check EMAIL_HOST, EMAIL_USER, and EMAIL_PASS.",
      };
    }

    console.log("📧 Mail sent via SMTP fallback:", request.to);
    return { sent: true, via: "smtp-fallback" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { sent: false, via: null, error: `SMTP fallback failed: ${reason}` };
  }
};

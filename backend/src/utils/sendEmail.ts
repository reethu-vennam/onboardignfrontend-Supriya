import nodemailer from "nodemailer";

type EmailAttachment = {
  filename: string;
  content: Buffer<ArrayBufferLike>;
  contentType?: string;
};

const createTransporter = () => {
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "465", 10),
      secure: process.env.EMAIL_SECURE !== "false",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments: EmailAttachment[] = []
) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("Email error: EMAIL_USER or EMAIL_PASS is missing in backend environment");
      return false;
    }

    const transporter = createTransporter();

    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || "payments@sabbpe.com";

    const info = await transporter.sendMail({
      from: `"SabbPe Payments" <${fromAddress}>`,
      replyTo: process.env.EMAIL_REPLY_TO || fromAddress,
      to,
      subject,
      html,
      attachments,
    });

    console.log("Email sent:", info.response);
    return true;
  } catch (error) {
    console.error("Email error:", error);
    return false;
  }
};

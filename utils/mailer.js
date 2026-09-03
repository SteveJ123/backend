import nodemailer from "nodemailer";

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  service: "gmail", // Or your preferred provider (SendGrid, Mailgun, etc.)
  auth: {
    user: process.env.EMAIL_USER, // e.g., 'your-email@gmail.com'
    pass: process.env.EMAIL_PASS, // App password (not your normal password)
  },
});

export const sendNotificationEmail = async (
  to,
  senderName,
  contentSnippet,
  postId,
) => {
  const postUrl = `http://localhost:4200/post/${postId}`; // Replace with production URL

  const mailOptions = {
    from: `"App Community" <${process.env.EMAIL_USER}>`,
    to,
    subject: `New Post Notification from ${senderName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #2563eb;">New Post Update</h2>
        <p><strong>${senderName}</strong> published a new post:</p>
        <blockquote style="background: #f3f4f6; padding: 12px; border-left: 4px solid #2563eb; margin: 16px 0;">
          "${contentSnippet.length > 120 ? contentSnippet.substring(0, 120) + "..." : contentSnippet}"
        </blockquote>
        <a href="${postUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 18px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          View Full Post
        </a>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error);
  }
};

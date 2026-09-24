const nodemailer = require('nodemailer');

const createTransporter = () => {
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: process.env.SMTP_SECURE === undefined ? port === 465 : process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Send password reset email with a single-use reset link.
 * @param {string} toEmail - Recipient email address
 * @param {string} resetUrl - Password reset page URL
 */
const sendResetPasswordEmail = async (toEmail, resetUrl) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  const transporter = createTransporter();

  const mailOptions = {
    from: `"PeoplePulse HRMS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'PeoplePulse - Password Reset Request',
    text: `Hello,\n\nWe received a request to reset your PeoplePulse password.\n\nOpen this link to choose a new password: ${resetUrl}\n\nThis link expires in 30 minutes and can only be used once.\n\nRegards,\nPeoplePulse HRMS Team`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 700;">PeoplePulse HRMS</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Employee Management System</p>
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
          <p style="font-size: 15px; color: #1e293b; margin-bottom: 12px;">Hello,</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password. Use the secure link below to choose a new password:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 13px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">Reset my password</a>
          </div>
          <p style="font-size: 14px; color: #64748b; line-height: 1.5;">
            This link expires in 30 minutes and can only be used once. If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center;">
          <p style="font-size: 12px; color: #94a3b8; margin: 0;">
            If you did not request a password reset, please contact your HR administrator immediately.
          </p>
          <p style="font-size: 12px; color: #94a3b8; margin-top: 4px;">
            &copy; ${new Date().getFullYear()} PeoplePulse HRMS. All rights reserved.
          </p>
        </div>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
};

module.exports = {
  sendResetPasswordEmail,
};

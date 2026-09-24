const nodemailer = require('nodemailer');

/**
 * Whether SMTP credentials are configured. When they aren't, callers should
 * fall back to a dev-friendly response instead of trying to send mail.
 */
const isEmailConfigured = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

const createTransporter = () =>
  nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

/**
 * Send the password-reset link to a user's work email.
 * @param {string} toEmail Recipient email address
 * @param {string} resetUrl Full URL the user follows to reset their password
 */
const sendResetPasswordEmail = async (toEmail, resetUrl) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"PeoplePulse HRMS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'PeoplePulse - Password Reset Request',
    text: `Hello,\n\nWe received a request to reset your PeoplePulse password.\n\nReset your password using this link (valid for 30 minutes):\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.\n\nRegards,\nPeoplePulse HRMS Team`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 700;">PeoplePulse HRMS</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Employee Management System</p>
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
          <p style="font-size: 15px; color: #1e293b; margin-bottom: 12px;">Hello,</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password. This link is valid for 30 minutes:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: bold; border-radius: 8px; text-decoration: none; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 13px; color: #64748b; word-break: break-all;">${resetUrl}</p>
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

  return transporter.sendMail(mailOptions);
};

module.exports = {
  isEmailConfigured,
  sendResetPasswordEmail,
};

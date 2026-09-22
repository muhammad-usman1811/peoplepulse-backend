const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Send password reset email with temporary password
 * @param {string} toEmail - Recipient email address
 * @param {string} tempPassword - Temporary password generated
 */
const sendResetPasswordEmail = async (toEmail, tempPassword) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"PeoplePulse HRMS" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'PeoplePulse - Password Reset Request',
    text: `Hello,\n\nYour PeoplePulse password has been reset successfully.\n\nYour temporary password is: ${tempPassword}\n\nPlease use this temporary password to login and change your password afterwards.\n\nRegards,\nPeoplePulse HRMS Team`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 700;">PeoplePulse HRMS</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Employee Management System</p>
        </div>
        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
          <p style="font-size: 15px; color: #1e293b; margin-bottom: 12px;">Hello,</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
            We received a request to reset your password. Your temporary password has been generated below:
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; padding: 14px 28px; font-size: 22px; font-weight: bold; letter-spacing: 3px; color: #2563eb; border-radius: 8px; display: inline-block;">
              ${tempPassword}
            </div>
          </div>
          <p style="font-size: 14px; color: #64748b; line-height: 1.5;">
            Please use this password to log in. For security purposes, please do not share this password with anyone.
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

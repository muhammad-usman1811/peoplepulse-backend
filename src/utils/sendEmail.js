const nodemailer = require('nodemailer');
const AppError = require('./appError');

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

const sendResetPasswordEmail = async (toEmail, resetUrl) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new AppError('SMTP credentials are not configured', 503);
  }

  try {
    const transporter = createTransporter();
    return await transporter.sendMail({
      from: `"PeoplePulse HRMS" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: 'PeoplePulse - Password Reset Request',
      text: `Hello,\n\nWe received a request to reset your PeoplePulse password.\n\nOpen this link to choose a new password: ${resetUrl}\n\nThis link expires in 30 minutes and can only be used once.\n\nRegards,\nPeoplePulse HRMS Team`,
      html: `<div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px;"><h2>PeoplePulse HRMS</h2><p>We received a request to reset your password.</p><p><a href="${resetUrl}">Reset my password</a></p><p>This link expires in 30 minutes and can only be used once.</p></div>`,
    });
  } catch (error) {
    throw new AppError('Password reset email could not be sent', 503, error);
  }
};

module.exports = { sendResetPasswordEmail };
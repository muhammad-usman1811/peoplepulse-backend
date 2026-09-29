require('dotenv').config();
const nodemailer = require('nodemailer');
const { isEmailConfigured } = require('./src/utils/sendEmail');

async function testLiveSmtp() {
  console.log('--- Testing Live SMTP Email Configuration ---');
  
  if (!isEmailConfigured()) {
    console.log('⚠️  SMTP credentials (EMAIL_USER / EMAIL_PASS) are not set in .env.');
    console.log('To verify actual inbox email delivery:');
    console.log('1. Set SMTP_HOST, SMTP_PORT, SMTP_SECURE in .env');
    console.log('2. Set EMAIL_USER (e.g. your email address)');
    console.log('3. Set EMAIL_PASS (e.g. Gmail App Password)');
    console.log('4. Run this script again: node test-live-email-smtp.js <recipient_email>');
    return;
  }

  const recipient = process.argv[2] || process.env.EMAIL_USER;
  console.log(`Configured Sender: ${process.env.EMAIL_USER}`);
  console.log(`Target Recipient: ${recipient}`);
  console.log(`SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${process.env.SMTP_PORT || 465}`);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === undefined
      ? Number(process.env.SMTP_PORT || 465) === 465
      : process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully!');

    console.log(`Sending test email to ${recipient}...`);
    const info = await transporter.sendMail({
      from: `"PeoplePulse HRMS Verification" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: 'PeoplePulse - Live Email Delivery Verification',
      text: 'This is a test email verifying that PeoplePulse SMTP delivery is working correctly.',
      html: '<div style="padding: 20px; font-family: sans-serif;"><h2>PeoplePulse SMTP Verification</h2><p>Live email delivery is working!</p></div>',
    });

    console.log('✅ Email sent successfully!');
    console.log(`Message ID: ${info.messageId}`);
    console.log(`Response: ${info.response}`);
  } catch (err) {
    console.error('❌ SMTP verification failed:', err.message);
  }
}

testLiveSmtp();

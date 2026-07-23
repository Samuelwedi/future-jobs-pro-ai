import nodemailer from 'nodemailer';
import { Buffer } from 'buffer';

// ─── SMTP Configuration ───
const isSMTPConfigured = (): boolean => {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

let transporter: nodemailer.Transporter | null = null;
if (isSMTPConfigured()) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log('📧 SMTP configured – email sending enabled');
} else {
  console.log('⚠️  SMTP not configured – email sending is disabled.');
}

// ─── Send email (generic) ───
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    console.log(`📧 [Samuel B.] Email would be sent to ${to} – Subject: ${subject}`);
    console.log('   (Email sending is disabled – SMTP not configured)');
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@futurejobsproai.com',
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
  }
}

// ─── Send email with attachment ─────────────────────────────────
export async function sendEmailWithAttachment(
  to: string,
  subject: string,
  html: string,
  attachment: { filename: string; content: Buffer; contentType: string }
): Promise<void> {
  if (!transporter) {
    console.log(`📧 [Samuel B.] Email would be sent to ${to} – Subject: ${subject}`);
    console.log('   (Email sending is disabled – SMTP not configured)');
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@futurejobsproai.com',
      to,
      subject,
      html,
      attachments: [attachment],
    });
    console.log(`✅ Email with attachment sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send email with attachment to ${to}:`, error);
  }
}

// ─── Pay Stub Email ─────────────────────────────────────────────
export async function sendPayStubEmail(
  toEmail: string,
  employeeName: string,
  payrollPeriod: string,
  pdfBuffer: Buffer,
  pdfFilename: string
): Promise<void> {
  const subject = `Your Pay Stub – ${payrollPeriod}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0A0A; color: #FFF;">
      <h2 style="color: #00D4FF;">Pay Stub for ${employeeName}</h2>
      <p>Period: <strong>${payrollPeriod}</strong></p>
      <p>Please find your pay stub attached.</p>
      <p>You can also view and download all your pay stubs from the <a href="https://app.futurejobspro.com/employee-portal" style="color: #00D4FF;">Employee Portal</a>.</p>
      <br/>
      <p>Thank you,<br/>The Future Jobs Pro AI Team</p>
      <hr style="border-color: #333;"/>
      <p style="font-size: 12px; color: #666;">This is an automated message. Please do not reply to this email.</p>
    </div>
  `;

  await sendEmailWithAttachment(toEmail, subject, html, {
    filename: pdfFilename,
    content: pdfBuffer,
    contentType: 'application/pdf',
  });
}

// ─── Invite email ────────────────────────────────────────────────
export async function sendInviteEmail(
  email: string,
  firstName: string,
  tempPassword: string,
  companyName: string
): Promise<void> {
  const subject = `Welcome to ${companyName} – Your Temporary Password`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0A0A; color: #FFF;">
      <h2 style="color: #00D4FF;">Welcome to ${companyName}</h2>
      <p>Hello <strong>${firstName}</strong>,</p>
      <p>You have been invited to join <strong>${companyName}</strong> on <strong>Future Jobs Pro AI</strong>.</p>
      <p>Your temporary password is: <span style="background: #1A1A1A; padding: 4px 12px; border-radius: 6px; font-family: monospace;">${tempPassword}</span></p>
      <p>Please log in at <a href="https://futurejobsproai.com/login" style="color: #00D4FF;">https://futurejobsproai.com/login</a> and change your password immediately.</p>
      <p>If you have any questions, contact <a href="mailto:support@futurejobsproai.com" style="color: #00D4FF;">support@futurejobsproai.com</a>.</p>
      <p>Thanks,<br/>The Future Jobs Pro AI Team</p>
    </div>
  `;
  await sendEmail(email, subject, html);
}

// ─── Clock‑in notification ──────────────────────────────────────
export async function sendClockInNotification(
  email: string,
  name: string,
  projectName: string,
  time: Date,
  companyName: string
): Promise<void> {
  const subject = `Clock‑in Notification – ${companyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0A0A; color: #FFF;">
      <h2 style="color: #00D4FF;">Clock‑in Alert</h2>
      <p><strong>${name}</strong> clocked in at <strong>${time.toLocaleString()}</strong> for project <strong>${projectName}</strong>.</p>
    </div>
  `;
  await sendEmail(email, subject, html);
}

// ─── Shift assignment notification ──────────────────────────────
export async function sendShiftAssignmentEmail(
  email: string,
  name: string,
  shiftName: string,
  shiftDate: string,
  shiftTime: string,
  companyName: string
): Promise<void> {
  const subject = `New Shift Assigned – ${companyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0A0A; color: #FFF;">
      <h2 style="color: #00D4FF;">New Shift Assigned</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>You have been assigned to a shift:</p>
      <ul>
        <li><strong>Shift:</strong> ${shiftName}</li>
        <li><strong>Date:</strong> ${shiftDate}</li>
        <li><strong>Time:</strong> ${shiftTime}</li>
      </ul>
      <p>Please check your schedule for details.</p>
      <p>Thanks,<br/>The Future Jobs Pro AI Team</p>
    </div>
  `;
  await sendEmail(email, subject, html);
}

// ─── Test email (for debugging) ─────────────────────────────────
export async function sendTestEmail(to: string): Promise<void> {
  const subject = 'Test Email from Future Jobs Pro AI';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0A0A; color: #FFF;">
      <h2 style="color: #00D4FF;">Test Email</h2>
      <p>This is a test email from Future Jobs Pro AI.</p>
      <p>If you received this, your email configuration is working correctly.</p>
      <p>Thanks,<br/>The Future Jobs Pro AI Team</p>
    </div>
  `;
  await sendEmail(to, subject, html);
}
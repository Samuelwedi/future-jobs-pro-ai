// backend/src/services/emailService.ts
import nodemailer from 'nodemailer';

// Check if SMTP is configured
const isSMTPConfigured = () => {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
};

let transporter: nodemailer.Transporter | null = null;
if (isSMTPConfigured()) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} else {
  console.log('⚠️  SMTP not configured – email sending is disabled.');
}

// ✅ Named export – used by teamService.ts
export async function sendInviteEmail(
  email: string,
  firstName: string,
  tempPassword: string,
  companyName: string
): Promise<void> {
  const subject = `Welcome to ${companyName} – Your Temporary Password`;
  const text = `
Hello ${firstName},

You have been invited to join ${companyName} on Future Jobs Pro AI.

Your temporary password is: ${tempPassword}

Please log in at https://futurejobsproai.com/login and change your password immediately.

If you have any questions, contact support@futurejobsproai.com.

Thanks,
The Future Jobs Pro AI Team
  `;

  if (!transporter) {
    console.log(`📧 [Samuel B.] Invite email would be sent to ${email} with password: ${tempPassword}`);
    console.log(`   (Email sending is disabled – SMTP not configured)`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@futurejobsproai.com',
      to: email,
      subject,
      text,
    });
    console.log(`✅ Invite email sent to ${email}`);
  } catch (error) {
    console.error(`❌ Failed to send invite email to ${email}:`, error);
  }
}
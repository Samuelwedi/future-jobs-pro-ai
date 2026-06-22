// ============================================
// EMAIL SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject,
    text,
  });
}
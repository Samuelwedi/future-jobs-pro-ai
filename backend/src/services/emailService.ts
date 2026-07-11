import nodemailer from 'nodemailer';

// Create a transporter if SMTP env vars are provided. If not, transporter stays null
// and the functions will log the intended emails instead of sending.
let transporter: nodemailer.Transporter | null = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendClockInNotification(
  userEmail: string,
  userName: string,
  projectName: string,
  clockInTime: Date
): Promise<void> {
  const subject = 'Clocked In';
  const text = `
Hello ${userName},

You have clocked in for project "${projectName}" at ${clockInTime.toLocaleString()}.

Best,
Future Jobs Pro AI
  `;
  if (!transporter) {
    console.log(`📧 [Samuel B.] Clock-in notification would be sent to ${userEmail}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@futurejobsproai.com',
    to: userEmail,
    subject,
    text,
  });
}

export async function sendClockOutNotification(
  userEmail: string,
  userName: string,
  projectName: string,
  clockOutTime: Date,
  regularHours: number,
  overtimeHours: number,
  totalWage: number
): Promise<void> {
  const subject = 'Clocked Out';
  const text = `
Hello ${userName},

You have clocked out from project "${projectName}" at ${clockOutTime.toLocaleString()}.

Hours: ${regularHours.toFixed(2)} regular, ${overtimeHours.toFixed(2)} overtime
Total Wage: $${totalWage.toFixed(2)}

Best,
Future Jobs Pro AI
  `;
  if (!transporter) {
    console.log(`📧 [Samuel B.] Clock-out notification would be sent to ${userEmail}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@futurejobsproai.com',
    to: userEmail,
    subject,
    text,
  });
}

export async function sendShiftAssignmentNotification(
  userEmail: string,
  userName: string,
  shiftName: string,
  date: string,
  startTime: string,
  endTime: string,
  projectName: string
): Promise<void> {
  const subject = 'New Shift Assigned';
  const text = `
Hello ${userName},

You have been assigned to a new shift:

Shift: ${shiftName}
Date: ${date}
Time: ${startTime} – ${endTime}
Project: ${projectName}

Please check your schedule for details.

Best,
Future Jobs Pro AI
  `;
  if (!transporter) {
    console.log(`📧 [Samuel B.] Shift assignment notification would be sent to ${userEmail}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'noreply@futurejobsproai.com',
    to: userEmail,
    subject,
    text,
  });
}
import nodemailer from 'nodemailer';

export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() ?? user;
  if (!host || !user || !pass || !from) {
    throw new Error('SMTP not configured');
  }

  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject: 'Music Story — код входа',
    text: `Код для входа: ${code}\n\nДействует 15 минут.`,
  });
}

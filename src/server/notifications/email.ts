import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Email] SMTP not configured. Email notifications disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendEmailAlert(params: {
  to: string;
  subject: string;
  topicTitle: string;
  summary: string;
  sourceCount: number;
  url: string;
}): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.to,
      subject: params.subject,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0E1223; color: #F8FAFC; border-radius: 8px; overflow: hidden;">
          <div style="background: #020617; padding: 20px; border-bottom: 1px solid #00FF41;">
            <h1 style="margin: 0; font-size: 20px; color: #00FF41;">⚡ PulseAI Alert</h1>
          </div>
          <div style="padding: 24px;">
            <h2 style="margin: 0 0 12px; font-size: 18px; color: #F8FAFC;">${params.topicTitle}</h2>
            <p style="margin: 0 0 16px; font-size: 14px; color: #94A3B8; line-height: 1.6;">${params.summary}</p>
            <div style="background: #1A1E2F; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
              <span style="font-size: 12px; color: #94A3B8;">📡 已登上 <strong style="color: #00FF41;">${params.sourceCount}</strong> 个平台热搜</span>
            </div>
            <a href="${params.url}" style="display: inline-block; background: #00FF41; color: #020617; padding: 10px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px;">查看详情 →</a>
          </div>
          <div style="background: #020617; padding: 12px 20px; text-align: center; font-size: 11px; color: #475569;">
            由 PulseAI 热点监控系统自动发送
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[Email] Send error:', err);
    return false;
  }
}

// Robust Gmail SMTP sender using denomailer with STARTTLS on port 587.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export interface SendOpts {
  to: string;
  subject: string;
  html: string;
  bcc?: string[];
  fromName?: string;
  fromAddress?: string;
}

export async function sendGmail(opts: SendOpts): Promise<void> {
  const rawPassword = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!rawPassword) throw new Error("GMAIL_APP_PASSWORD not configured");
  const password = rawPassword.replace(/\s/g, "");
  const fromAddress = opts.fromAddress || "originee.store@gmail.com";
  const fromName = opts.fromName || "Originee Store";

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: fromAddress, password },
    },
    pool: false,
    debug: { log: false, allowUnsecure: false, encodeLB: true, noStartTLS: false },
  });

  try {
    await client.send({
      from: `${fromName} <${fromAddress}>`,
      to: opts.to,
      bcc: opts.bcc && opts.bcc.length ? opts.bcc : undefined,
      subject: opts.subject,
      content: "Order details in HTML.",
      html: opts.html,
    });
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}

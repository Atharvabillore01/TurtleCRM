import type { OTPProvider } from "./interface.js";

const MSG91_BASE = "https://api.msg91.com/api/v5";

export class MSG91Provider implements OTPProvider {
  private readonly authKey:    string;
  private readonly senderId:   string;
  private readonly templateId: string;

  constructor() {
    this.authKey    = process.env["MSG91_AUTH_KEY"]    ?? (() => { throw new Error("MSG91_AUTH_KEY required"); })();
    this.senderId   = process.env["MSG91_SENDER_ID"]   ?? (() => { throw new Error("MSG91_SENDER_ID required"); })();
    this.templateId = process.env["MSG91_TEMPLATE_ID"] ?? (() => { throw new Error("MSG91_TEMPLATE_ID required"); })();
  }

  async sendSMS(phone: string, otp: string): Promise<void> {
    const res = await fetch(`${MSG91_BASE}/otp`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "authkey":       this.authKey,
      },
      body: JSON.stringify({
        template_id: this.templateId,
        mobile:      phone.replace(/^\+/, ""), // MSG91 expects no leading +
        authkey:     this.authKey,
        otp,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MSG91 SMS failed: ${res.status} ${body}`);
    }
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    // MSG91 email via their Send Mail API
    const res = await fetch("https://api.msg91.com/api/v5/email/send", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "authkey":      this.authKey,
      },
      body: JSON.stringify({
        recipients: [{ to: [{ email }] }],
        from:       { email: process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@turtlecorporate.com" },
        domain:     process.env["MSG91_EMAIL_DOMAIN"] ?? "",
        subject:    "Your Turtle Corporate OTP",
        body:       `<p>Your OTP is: <strong>${otp}</strong></p><p>Valid for 5 minutes. Do not share this code.</p>`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MSG91 email failed: ${res.status} ${body}`);
    }
  }
}

import type { OTPProvider } from "./interface.js";

export class HapticProvider implements OTPProvider {
  private readonly apiKey:   string;
  private readonly senderId: string;
  private readonly baseUrl:  string;

  constructor() {
    this.apiKey   = process.env["HAPTIC_API_KEY"]   ?? (() => { throw new Error("HAPTIC_API_KEY required"); })();
    this.senderId = process.env["HAPTIC_SENDER_ID"] ?? (() => { throw new Error("HAPTIC_SENDER_ID required"); })();
    this.baseUrl  = process.env["HAPTIC_BASE_URL"]  ?? (() => { throw new Error("HAPTIC_BASE_URL required"); })();
  }

  async sendSMS(phone: string, otp: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sms/send`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        sender:  this.senderId,
        to:      phone,
        message: `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
        type:    "transactional",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Haptic SMS failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { success: boolean; error?: string };
    if (!data.success) {
      throw new Error(`Haptic SMS error: ${data.error ?? "unknown"}`);
    }
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/email/send`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from:    process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@turtlecorporate.com",
        to:      email,
        subject: "Your Turtle Corporate OTP",
        html:    `<p>Your OTP is: <strong>${otp}</strong></p><p>Valid for 5 minutes. Do not share this code.</p>`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Haptic email failed: ${res.status} ${body}`);
    }
  }
}

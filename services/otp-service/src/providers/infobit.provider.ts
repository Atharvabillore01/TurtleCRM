import type { OTPProvider } from "./interface.js";

export class InfobitProvider implements OTPProvider {
  private readonly apiKey:   string;
  private readonly senderId: string;
  private readonly baseUrl:  string;

  constructor() {
    this.apiKey   = process.env["INFOBIT_API_KEY"]   ?? (() => { throw new Error("INFOBIT_API_KEY required"); })();
    this.senderId = process.env["INFOBIT_SENDER_ID"] ?? (() => { throw new Error("INFOBIT_SENDER_ID required"); })();
    this.baseUrl  = process.env["INFOBIT_BASE_URL"]  ?? (() => { throw new Error("INFOBIT_BASE_URL required"); })();
  }

  async sendSMS(phone: string, otp: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/sms`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":    this.apiKey,
      },
      body: JSON.stringify({
        sender_id: this.senderId,
        to:        phone,
        text:      `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
        type:      "OTP",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Infobit SMS failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { status: string; message?: string };
    if (data.status !== "success") {
      throw new Error(`Infobit SMS error: ${data.message ?? "unknown"}`);
    }
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/email`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":    this.apiKey,
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
      throw new Error(`Infobit email failed: ${res.status} ${body}`);
    }
  }
}

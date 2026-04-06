import type { OTPProvider } from "./interface.js";

export class InfobipProvider implements OTPProvider {
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = process.env["INFOBIP_API_KEY"] ?? (() => { throw new Error("INFOBIP_API_KEY required"); })();
    this.senderId = process.env["INFOBIP_SENDER_ID"] ?? (() => { throw new Error("INFOBIP_SENDER_ID required"); })();
    this.baseUrl = (process.env["INFOBIP_BASE_URL"] ?? "https://api.infobip.com").replace(/\/$/, "");
  }

  async sendSMS(phone: string, otp: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sms/2/text/advanced`, {
      method: "POST",
      headers: {
        Authorization: `App ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            from: this.senderId,
            destinations: [{ to: phone }],
            text: `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Infobip SMS failed: ${res.status} ${body}`);
    }
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/email/3/send`, {
      method: "POST",
      headers: {
        Authorization: `App ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@turtlecorporate.com",
        to: [{ email }],
        subject: "Your Turtle Corporate OTP",
        html: `<p>Your OTP is: <strong>${otp}</strong></p><p>Valid for 5 minutes. Do not share this code.</p>`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Infobip email failed: ${res.status} ${body}`);
    }
  }
}

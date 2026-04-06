import type { OTPProvider } from "./interface.js";

const GUPSHUP_SMS_URL       = "https://enterprise.smsgupshup.com/GatewayAPI/rest";
const GUPSHUP_WHATSAPP_BASE = "https://api.gupshup.io/sm/api/v1/msg";

export class GupshupProvider implements OTPProvider {
  private readonly apiKey:   string;
  private readonly senderId: string;
  private readonly appName:  string;

  constructor() {
    this.apiKey   = process.env["GUPSHUP_API_KEY"]    ?? (() => { throw new Error("GUPSHUP_API_KEY required"); })();
    this.senderId = process.env["GUPSHUP_SENDER_ID"]  ?? (() => { throw new Error("GUPSHUP_SENDER_ID required"); })();
    this.appName  = process.env["GUPSHUP_APP_NAME"]   ?? (() => { throw new Error("GUPSHUP_APP_NAME required"); })();
  }

  async sendSMS(phone: string, otp: string): Promise<void> {
    const params = new URLSearchParams({
      method:      "SendMessage",
      send_to:     phone,
      msg:         `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
      msg_type:    "TEXT",
      userid:      this.senderId,
      auth_scheme: "plain",
      password:    this.apiKey,
      v:           "1.1",
      format:      "json",
    });

    const res = await fetch(`${GUPSHUP_SMS_URL}?${params.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gupshup SMS failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as { response: { status: string } };
    if (data.response?.status !== "success") {
      throw new Error(`Gupshup SMS error: ${JSON.stringify(data)}`);
    }
  }

  /** Sends OTP via WhatsApp using Gupshup's WhatsApp Business API */
  async sendEmail(destination: string, otp: string): Promise<void> {
    // Gupshup doesn't natively send email — use WhatsApp as fallback channel
    const res = await fetch(GUPSHUP_WHATSAPP_BASE, {
      method:  "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "apikey":       this.apiKey,
      },
      body: new URLSearchParams({
        channel:     "whatsapp",
        source:      this.senderId,
        destination,
        message:     JSON.stringify({
          type: "text",
          text: `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
        }),
        "src.name":  this.appName,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gupshup WhatsApp failed: ${res.status} ${body}`);
    }
  }
}

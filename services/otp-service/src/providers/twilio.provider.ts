import twilio from "twilio";
import sgMail from "@sendgrid/mail";
import type { OTPProvider } from "./interface.js";

function getTwilioClient() {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken  = process.env["TWILIO_AUTH_TOKEN"];
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured");
  return twilio(accountSid, authToken);
}

export class TwilioProvider implements OTPProvider {
  private readonly fromNumber: string;

  constructor() {
    const from = process.env["TWILIO_FROM_NUMBER"];
    if (!from) throw new Error("TWILIO_FROM_NUMBER is required");
    this.fromNumber = from;

    const sgKey = process.env["SENDGRID_API_KEY"];
    if (!sgKey) throw new Error("SENDGRID_API_KEY is required for email OTP");
    sgMail.setApiKey(sgKey);
  }

  async sendSMS(phone: string, otp: string): Promise<void> {
    const client = getTwilioClient();
    await client.messages.create({
      to:   phone,
      from: this.fromNumber,
      body: `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
    });
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    await sgMail.send({
      to:      email,
      from:    process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@turtlecorporate.com",
      subject: "Your Turtle Corporate OTP",
      text:    `Your OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`,
      html:    `<p>Your OTP is: <strong>${otp}</strong></p><p>Valid for 5 minutes. Do not share this code.</p>`,
    });
  }
}

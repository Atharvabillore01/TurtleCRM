import type { OTPProvider } from "./interface.js";

export class MockProvider implements OTPProvider {
  async sendSMS(phone: string, otp: string): Promise<void> {
    console.log(`[mock] SMS → ${phone}  OTP: ${otp}`);
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    console.log(`[mock] Email → ${email}  OTP: ${otp}`);
  }
}

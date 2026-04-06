export interface OTPProvider {
  sendSMS(phone: string, otp: string): Promise<void>;
  sendEmail(email: string, otp: string): Promise<void>;
}

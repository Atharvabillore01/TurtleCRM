import { z } from "zod";

export const AdvisorLoginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});

export const AdvisorVerifyOTPSchema = z.object({
  sessionId: z.string().uuid(),
  otp:       z.string().length(6).regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export type AdvisorLoginBody     = z.infer<typeof AdvisorLoginSchema>;
export type AdvisorVerifyOTPBody = z.infer<typeof AdvisorVerifyOTPSchema>;

import { z } from "zod";

export const RequestOTPSchema = z.object({
  channel:     z.enum(["sms", "email"]),
  destination: z
    .string()
    .min(1)
    .refine(
      (val) =>
        /^\+?[1-9]\d{6,14}$/.test(val) ||          // phone
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),    // email
      { message: "destination must be a valid phone number or email address" }
    ),
});

export const VerifyOTPSchema = z.object({
  requestId:   z.string().uuid(),
  destination: z.string().min(1),
  otp:         z.string().length(6).regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export type RequestOTPBody = z.infer<typeof RequestOTPSchema>;
export type VerifyOTPBody  = z.infer<typeof VerifyOTPSchema>;

import type { OTPProvider } from "./interface.js";
import { MockProvider }    from "./mock.provider.js";
import { TwilioProvider }  from "./twilio.provider.js";
import { AWSProvider }     from "./aws.provider.js";
import { MSG91Provider }   from "./msg91.provider.js";
import { GupshupProvider } from "./gupshup.provider.js";
import { HapticProvider }  from "./haptic.provider.js";
import { InfobitProvider } from "./infobit.provider.js";

export type OTPProviderName =
  | "twilio" | "aws" | "msg91" | "gupshup" | "haptic" | "infobit" | "mock";

export function createOTPProvider(): OTPProvider {
  const name = (process.env["OTP_PROVIDER"] ?? "mock") as OTPProviderName;

  switch (name) {
    case "twilio":  return new TwilioProvider();
    case "aws":     return new AWSProvider();
    case "msg91":   return new MSG91Provider();
    case "gupshup": return new GupshupProvider();
    case "haptic":  return new HapticProvider();
    case "infobit": return new InfobitProvider();
    case "mock":
    default:        return new MockProvider();
  }
}

let _instance: OTPProvider | null = null;

/** Singleton — instantiated once at startup */
export function getOTPProvider(): OTPProvider {
  if (!_instance) _instance = createOTPProvider();
  return _instance;
}

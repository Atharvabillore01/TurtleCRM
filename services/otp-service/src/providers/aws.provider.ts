import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { OTPProvider } from "./interface.js";

function getSNS(): SNSClient {
  return new SNSClient({
    region:      process.env["AWS_REGION"] ?? "ap-south-1",
    credentials: {
      accessKeyId:     process.env["AWS_ACCESS_KEY_ID"]!,
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
    },
  });
}

function getSES(): SESClient {
  return new SESClient({
    region:      process.env["AWS_REGION"] ?? "ap-south-1",
    credentials: {
      accessKeyId:     process.env["AWS_ACCESS_KEY_ID"]!,
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"]!,
    },
  });
}

export class AWSProvider implements OTPProvider {
  async sendSMS(phone: string, otp: string): Promise<void> {
    await getSNS().send(
      new PublishCommand({
        PhoneNumber: phone,
        Message:     `Your Turtle Corporate OTP is: ${otp}. Valid for 5 minutes.`,
        MessageAttributes: {
          "AWS.SNS.SMS.SenderID": {
            DataType:    "String",
            StringValue: process.env["AWS_SNS_SENDER_ID"] ?? "TurtleCorp",
          },
          "AWS.SNS.SMS.SMSType": {
            DataType:    "String",
            StringValue: "Transactional",
          },
        },
      })
    );
  }

  async sendEmail(email: string, otp: string): Promise<void> {
    const from = process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@turtlecorporate.com";
    await getSES().send(
      new SendEmailCommand({
        Source:      from,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: "Your Turtle Corporate OTP", Charset: "UTF-8" },
          Body: {
            Text: { Data: `Your OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`, Charset: "UTF-8" },
            Html: { Data: `<p>Your OTP is: <strong>${otp}</strong></p><p>Valid for 5 minutes.</p>`, Charset: "UTF-8" },
          },
        },
      })
    );
  }
}

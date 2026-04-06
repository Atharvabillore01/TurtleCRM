import { getEventBus, disconnectEventBus } from "@turtle/events";
import type { AuthEvent } from "@turtle/types";

export { disconnectEventBus };

export function initProducer(): void {
  getEventBus({ clientId: "otp-service", groupId: "otp-service-group" });
}

export async function publishEvent(event: AuthEvent): Promise<void> {
  await getEventBus().publish(event.topic, event as unknown as Record<string, unknown>);
}

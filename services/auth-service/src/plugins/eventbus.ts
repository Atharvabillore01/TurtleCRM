import { getEventBus, disconnectEventBus } from "@turtle/events";
import type { AuthEvent } from "@turtle/types";

export { disconnectEventBus };

/**
 * Initialise the singleton EventBus for auth-service.
 * Call once at startup before any publishEvent() calls.
 */
export function initEventBus(): void {
  getEventBus({ clientId: "auth-service", groupId: "auth-service-group" });
}

/**
 * Type-safe wrapper: maps a typed AuthEvent onto the generic
 * EventBusAdapter.publish(topic, payload) interface.
 */
export async function publishEvent(event: AuthEvent): Promise<void> {
  const bus = getEventBus();
  await bus.publish(event.topic, event as unknown as Record<string, unknown>);
}

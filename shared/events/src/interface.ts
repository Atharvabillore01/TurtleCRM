export interface EventBusAdapter {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>;
  subscribe(topic: string, handler: (payload: unknown) => Promise<void>): Promise<void>;
  disconnect(): Promise<void>;
}

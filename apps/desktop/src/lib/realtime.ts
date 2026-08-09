import {
  clientMessageSchema,
  makeEnvelope,
  serverMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from "@petlink/protocol";
import type { Session } from "./api";

type Listener = (message: ServerMessage) => void;

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private closedByUser = false;
  private listeners = new Set<Listener>();

  constructor(private readonly session: Session) {}

  connect() {
    this.closedByUser = false;
    const url = new URL(this.session.wsUrl);
    url.searchParams.set("token", this.session.token);
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      try {
        const parsed = serverMessageSchema.parse(JSON.parse(String(event.data)));
        this.listeners.forEach((listener) => listener(parsed));
      } catch (error) {
        console.error("Ignored invalid server message", error);
      }
    });
    this.socket.addEventListener("close", () => {
      this.socket = null;
      if (!this.closedByUser) this.reconnectTimer = window.setTimeout(() => this.connect(), 1_500);
    });
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  onMessage(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(message: ClientMessage) {
    const parsed = clientMessageSchema.parse(message);
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(parsed));
    return true;
  }

  command<T extends Omit<ClientMessage, "protocolVersion" | "messageId" | "timestamp">>(message: T) {
    return this.send({ ...makeEnvelope(), ...message } as ClientMessage);
  }
}

import { pageWindow } from "./window.js";

type JsonListener = (data: Record<string, unknown>, socket: WebSocket) => void;
type BinaryListener = (data: ArrayBuffer | ArrayBufferView, socket: WebSocket) => void;
type SendListener = (data: string | ArrayBuffer | ArrayBufferView, socket: WebSocket) => void;
type SocketListener = (socket: WebSocket) => void;

interface WsState {
  installed: boolean;
  apiVersion: number;
  json: Set<JsonListener>;
  binary: Set<BinaryListener>;
  send: Set<SendListener>;
  open: Set<SocketListener>;
  close: Set<SocketListener>;
  sockets: Set<WebSocket>;
}

const KEY = "__GG_KIT_WS__";
const API_VERSION = 1;

function state(): WsState | null {
  const win = pageWindow() as unknown as Record<string, WsState | undefined>;
  if (win[KEY]) {
    if (win[KEY]!.apiVersion !== API_VERSION) {
      console.warn(
        `[gg-kit] shared WebSocket hook version mismatch (${win[KEY]!.apiVersion} vs ${API_VERSION})`,
      );
    }
    return win[KEY]!;
  }
  const target = pageWindow() as unknown as Window & typeof globalThis;
  const Original = target.WebSocket;
  if (typeof Original !== "function") return null;
  const next: WsState = {
    installed: false,
    apiVersion: API_VERSION,
    json: new Set(),
    binary: new Set(),
    send: new Set(),
    open: new Set(),
    close: new Set(),
    sockets: new Set(),
  };
  const Wrapped = new Proxy(Original, {
    construct(Target, args, newTarget) {
      const socket = Reflect.construct(
        Target,
        args,
        newTarget === Wrapped ? Target : newTarget,
      ) as WebSocket;
      next.sockets.add(socket);
      socket.addEventListener("open", () => {
        for (const callback of next.open) safe(() => callback(socket));
      });
      socket.addEventListener("close", () => {
        next.sockets.delete(socket);
        for (const callback of next.close) safe(() => callback(socket));
      });
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            return;
          }
          for (const callback of next.json) safe(() => callback(parsed, socket));
          return;
        }
        const binary = toView(event.data);
        if (!binary) return;
        for (const callback of next.binary) safe(() => callback(binary, socket));
      });
      const originalSend = socket.send;
      socket.send = function (
        this: WebSocket,
        data: string | ArrayBufferLike | Blob | ArrayBufferView,
      ) {
        for (const callback of next.send)
          safe(() => callback(data as string | ArrayBuffer | ArrayBufferView, socket));
        return originalSend.call(this, data as string | ArrayBufferLike | Blob | ArrayBufferView);
      };
      return socket;
    },
  });
  target.WebSocket = Wrapped as unknown as typeof WebSocket;
  next.installed = true;
  win[KEY] = next;
  return next;
}

function safe(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    console.warn("[gg-kit] websocket listener failed", error);
  }
}

function toView(data: unknown): ArrayBuffer | ArrayBufferView | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data;
  return null;
}

export function onJsonMessage(callback: JsonListener): () => void {
  const current = state();
  if (!current) return () => {};
  current.json.add(callback);
  return () => current.json.delete(callback);
}

export function onBinaryMessage(callback: BinaryListener): () => void {
  const current = state();
  if (!current) return () => {};
  current.binary.add(callback);
  return () => current.binary.delete(callback);
}

export function onSendMessage(callback: SendListener): () => void {
  const current = state();
  if (!current) return () => {};
  current.send.add(callback);
  return () => current.send.delete(callback);
}

export function onSocketOpen(callback: SocketListener): () => void {
  const current = state();
  if (!current) return () => {};
  current.open.add(callback);
  return () => current.open.delete(callback);
}

export function onSocketClose(callback: SocketListener): () => void {
  const current = state();
  if (!current) return () => {};
  current.close.add(callback);
  return () => current.close.delete(callback);
}

export function sockets(): WebSocket[] {
  return [...(state()?.sockets || [])];
}

export function isDuelSocket(socket: WebSocket): boolean {
  const url = String(socket.url || "");
  return /gs2\.geoguessr\.com|game-server\.geoguessr\.com/i.test(url);
}

export function sendBinary(socket: WebSocket, data: ArrayBuffer | ArrayBufferView): boolean {
  if (socket.readyState !== 1) return false;
  try {
    socket.send(data as ArrayBufferView);
    return true;
  } catch (error) {
    console.warn("[gg-kit] websocket send failed", error);
    return false;
  }
}

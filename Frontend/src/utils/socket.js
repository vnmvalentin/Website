// src/utils/socket.js — Socket.io-URL: gleiche Origin (Vite-Proxy) oder VITE_SOCKET_URL
import { io } from "socket.io-client";

/**
 * - Ohne VITE_SOCKET_URL: gleiche Origin wie die Seite (lokal: Vite 5173 → proxy zu Backend).
 * - Mit VITE_SOCKET_URL (z. B. http://127.0.0.1:3001) wenn Frontend und API getrennt laufen.
 */
const explicit = import.meta.env.VITE_SOCKET_URL;
/** `undefined` = gleiche Origin (z. B. Vite-Proxy in Dev) */
export const socketServerUrl =
  typeof explicit === "string" && explicit.trim() !== "" ? explicit.trim() : undefined;

export const socket = io(socketServerUrl, {
  path: "/socket.io",
  withCredentials: true,
  autoConnect: true,
  transports: ["websocket", "polling"],
});

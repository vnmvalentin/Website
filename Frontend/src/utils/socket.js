// src/utils/socket.js
import { io } from "socket.io-client";

// URL anpassen, falls du lokal auf einem anderen Port bist, 
// aber meistens reicht "/" im gleichen Domain-Kontext.
const URL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000";

export const socket = io(URL, {
  path: "/socket.io",
  withCredentials: true,
  autoConnect: true,
  transports: ["websocket", "polling"] 
});
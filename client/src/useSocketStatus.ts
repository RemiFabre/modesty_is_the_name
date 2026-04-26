import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(() =>
    getSocket().connected ? "connected" : "connecting",
  );
  useEffect(() => {
    const socket = getSocket();
    setStatus(socket.connected ? "connected" : "connecting");
    const onConn = () => setStatus("connected");
    const onDisc = () => setStatus("disconnected");
    socket.on("connect", onConn);
    socket.on("disconnect", onDisc);
    return () => {
      socket.off("connect", onConn);
      socket.off("disconnect", onDisc);
    };
  }, []);
  return status;
}

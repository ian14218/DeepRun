import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const s = io(apiUrl);
    setSocket(s);
    return () => s.disconnect();
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

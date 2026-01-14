// src/hooks/useWebSocket.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface PanicAlert {
  type: 'PANIC_ALERT';
  alertId: string;
  patientName: string;
  patientId: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  nearbyHospitals: any[];
  message?: string;
  timestamp: Date;
}

interface QRAccessAlert {
  type: 'QR_ACCESS_ALERT';
  patientName: string;
  patientId: string;
  accessorName: string;
  location: string;
  nearestHospital?: string;
  timestamp: Date;
}

type AlertEvent = PanicAlert | QRAccessAlert;

interface UseWebSocketOptions {
  userId?: string;
  autoConnect?: boolean;
  onPanicAlert?: (alert: PanicAlert) => void;
  onQRAccessAlert?: (alert: QRAccessAlert) => void;
  onPanicCancelled?: (data: { alertId: string }) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { userId, autoConnect = true, onPanicAlert, onQRAccessAlert, onPanicCancelled } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState<AlertEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io(import.meta.env.VITE_WS_URL || 'http://189.137.0.35:3001', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('WebSocket conectado:', socket.id);
      setIsConnected(true);

      // Unirse a salas si hay userId
      if (userId) {
        socket.emit('join-user', userId);
        socket.emit('join-representative', userId);
      }
    });

    socket.on('disconnect', () => {
      console.log('WebSocket desconectado');
      setIsConnected(false);
    });

    // Eventos de alerta de panico
    socket.on('panic-alert', (data: PanicAlert) => {
      console.log('Alerta de panico recibida:', data);
      setLastAlert(data);
      onPanicAlert?.(data);
    });

    socket.on('panic-alert-sent', (data: PanicAlert) => {
      console.log('Alerta de panico enviada:', data);
      setLastAlert(data);
    });

    socket.on('panic-cancelled', (data: { alertId: string }) => {
      console.log('Alerta de panico cancelada:', data);
      onPanicCancelled?.(data);
    });

    // Eventos de acceso QR
    socket.on('qr-access-alert', (data: QRAccessAlert) => {
      console.log('Alerta de acceso QR recibida:', data);
      setLastAlert(data);
      onQRAccessAlert?.(data);
    });

    socket.on('qr-access-notification', (data: QRAccessAlert) => {
      console.log('Notificacion de acceso QR:', data);
      setLastAlert(data);
    });

    socketRef.current = socket;
  }, [userId, onPanicAlert, onQRAccessAlert, onPanicCancelled]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const joinUserRoom = useCallback((roomUserId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-user', roomUserId);
      socketRef.current.emit('join-representative', roomUserId);
    }
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Join room when userId changes
  useEffect(() => {
    if (userId && isConnected) {
      joinUserRoom(userId);
    }
  }, [userId, isConnected, joinUserRoom]);

  return {
    isConnected,
    lastAlert,
    connect,
    disconnect,
    joinUserRoom,
    socket: socketRef.current,
  };
}

export default useWebSocket;

// src/components/panic/PanicButton.tsx
import { useState, useEffect } from 'react';

interface PanicButtonProps {
  onPanicActivated?: (result: any) => void;
  onError?: (error: string) => void;
}

export default function PanicButton({ onPanicActivated, onError }: PanicButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  // Countdown when confirming
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isConfirming && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (isConfirming && countdown === 0) {
      activatePanic();
    }
    return () => clearTimeout(timer);
  }, [isConfirming, countdown]);

  // Hold progress
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isHolding) {
      interval = setInterval(() => {
        setHoldProgress((prev) => {
          if (prev >= 100) {
            setIsConfirming(true);
            setIsHolding(false);
            return 0;
          }
          return prev + 5;
        });
      }, 100);
    } else {
      setHoldProgress(0);
    }
    return () => clearInterval(interval);
  }, [isHolding]);

  const activatePanic = async () => {
    setIsActivating(true);

    try {
      // Get token from localStorage
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No hay sesión activa');
      }

      // Get current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;

      // Call API
      const response = await fetch('/api/v1/emergency/panic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          latitude,
          longitude,
          accuracy,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onPanicActivated?.(data.data);
      } else {
        throw new Error(data.error?.message || 'Error al activar alerta');
      }
    } catch (error: any) {
      console.error('Error activating panic:', error);
      onError?.(error.message || 'No se pudo activar la alerta de panico');
    } finally {
      setIsActivating(false);
      setIsConfirming(false);
      setCountdown(3);
    }
  };

  const cancelPanic = () => {
    setIsConfirming(false);
    setCountdown(3);
    setIsHolding(false);
    setHoldProgress(0);
  };

  if (isActivating) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (isConfirming) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
        <div className="bg-white rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl font-bold text-red-600">{countdown}</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Activando Alerta</h2>
          <p className="text-gray-600 mb-6">
            Se notificara a tus representantes con tu ubicacion actual
          </p>

          <button
            onClick={cancelPanic}
            className="w-full py-4 bg-gray-200 text-gray-800 rounded-xl font-semibold hover:bg-gray-300 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Hold instruction */}
      {isHolding && (
        <div className="absolute -top-16 right-0 bg-black/80 text-white text-sm px-4 py-2 rounded-lg whitespace-nowrap">
          Mantener presionado...
        </div>
      )}

      {/* Progress ring */}
      <div className="relative">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#fecaca"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#dc2626"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${holdProgress * 2.83} 283`}
            className="transition-all duration-100"
          />
        </svg>

        {/* Button */}
        <button
          onMouseDown={() => setIsHolding(true)}
          onMouseUp={() => setIsHolding(false)}
          onMouseLeave={() => setIsHolding(false)}
          onTouchStart={() => setIsHolding(true)}
          onTouchEnd={() => setIsHolding(false)}
          className="absolute inset-2 bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:bg-red-700 active:bg-red-800 transition-all"
          style={{ touchAction: 'none' }}
        >
          <div className="text-center text-white">
            <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="text-xs font-bold">SOS</span>
          </div>
        </button>
      </div>
    </div>
  );
}

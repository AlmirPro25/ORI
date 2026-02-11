import { useEffect, useRef } from 'react';
import axios from 'axios';

interface UseWatchTrackingProps {
  videoId: string;
  videoDuration: number;
  currentTime: number;
  isPlaying: boolean;
}

/**
 * Hook para tracking automático de sessões de visualização
 * Envia dados para o Intelligence Engine
 */
export const useWatchTracking = ({
  videoId,
  videoDuration,
  currentTime,
  isPlaying,
}: UseWatchTrackingProps) => {
  const sessionStartRef = useRef<number>(0);
  const lastSentTimeRef = useRef<number>(0);
  const token = localStorage.getItem('token');

  // Inicia sessão quando começa a reproduzir
  useEffect(() => {
    if (isPlaying && sessionStartRef.current === 0) {
      sessionStartRef.current = currentTime;
      console.log('🎬 Sessão iniciada:', currentTime);
    }
  }, [isPlaying, currentTime]);

  // Envia dados a cada 30 segundos ou quando pausa/termina
  useEffect(() => {
    const shouldSend =
      sessionStartRef.current > 0 &&
      (currentTime - lastSentTimeRef.current >= 30 || !isPlaying);

    if (shouldSend && token) {
      sendTrackingData();
    }
  }, [currentTime, isPlaying]);

  // Envia dados quando desmonta (usuário sai da página)
  useEffect(() => {
    return () => {
      if (sessionStartRef.current > 0 && token) {
        sendTrackingData();
      }
    };
  }, []);

  const sendTrackingData = async () => {
    if (sessionStartRef.current === 0) return;

    try {
      await axios.post(
        'http://localhost:3000/api/intelligence/track',
        {
          videoId,
          startTime: sessionStartRef.current,
          endTime: currentTime,
          videoDuration,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log('📊 Tracking enviado:', {
        start: sessionStartRef.current,
        end: currentTime,
        duration: currentTime - sessionStartRef.current,
      });

      // Atualiza referências
      lastSentTimeRef.current = currentTime;
      sessionStartRef.current = currentTime;
    } catch (error) {
      console.error('❌ Erro ao enviar tracking:', error);
    }
  };
};

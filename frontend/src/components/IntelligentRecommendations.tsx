import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '@/lib/endpoints';

interface Video {
  id: string;
  title: string;
  category: string;
  thumbnailPath: string;
  duration: number;
  views: number;
  score?: number;
}

interface UserProfile {
  preferredGenres: Record<string, number>;
  avgSessionTime: number;
  completionRate: number;
}

export const IntelligentRecommendations: React.FC = () => {
  const [recommendations, setRecommendations] = useState<Video[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [explorationRate, setExplorationRate] = useState(0.1);

  const token = localStorage.getItem('token');

  useEffect(() => {
    loadData();
  }, [explorationRate]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Carregar perfil do usuário
      const profileRes = await axios.get(`${BACKEND_URL}/api/intelligence/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(profileRes.data);

      // Carregar recomendações
      const recsRes = await axios.get(`${BACKEND_URL}/api/intelligence/recommendations`, {
        params: { limit: 20, exploration: explorationRate },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecommendations(recsRes.data);
    } catch (error) {
      console.error('Erro ao carregar recomendações:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Calculando recomendações inteligentes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          🧠 Recomendações Inteligentes
        </h1>
        <p className="text-gray-400">
          Sistema híbrido: comportamento + popularidade + saúde da rede
        </p>
      </div>

      {/* Perfil do Usuário */}
      {profile && (
        <div className="max-w-7xl mx-auto mb-8 bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30">
          <h2 className="text-2xl font-bold text-white mb-4">📊 Seu Perfil Comportamental</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Tempo Médio de Sessão</p>
              <p className="text-3xl font-bold text-purple-400">
                {Math.round(profile.avgSessionTime / 60)}min
              </p>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Taxa de Conclusão</p>
              <p className="text-3xl font-bold text-green-400">
                {Math.round(profile.completionRate * 100)}%
              </p>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Gêneros Preferidos</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(profile.preferredGenres)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([genre, score]) => (
                    <span
                      key={genre}
                      className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs"
                    >
                      {genre} ({Math.round(score * 100)}%)
                    </span>
                  ))}
              </div>
            </div>
          </div>

          {/* Controle de Exploração */}
          <div className="bg-gray-900/50 rounded-lg p-4">
            <label className="text-white font-semibold mb-2 block">
              Taxa de Exploração: {Math.round(explorationRate * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.05"
              value={explorationRate}
              onChange={(e) => setExplorationRate(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-gray-400 text-sm mt-2">
              {explorationRate < 0.1
                ? '🎯 Modo Conservador: Apenas conteúdo testado'
                : explorationRate < 0.3
                ? '⚖️ Modo Balanceado: Mix de conhecido e novo'
                : '🚀 Modo Explorador: Descobrindo novos conteúdos'}
            </p>
          </div>
        </div>
      )}

      {/* Grid de Recomendações */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {recommendations.map((video) => (
            <div
              key={video.id}
              className="bg-gray-800/50 backdrop-blur-sm rounded-lg overflow-hidden border border-purple-500/30 hover:border-purple-500 transition-all cursor-pointer group"
              onClick={() => (window.location.href = `/player/${video.id}`)}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-gray-900">
                {video.thumbnailPath ? (
                  <img
                    src={
                      video.thumbnailPath?.startsWith('http')
                        ? video.thumbnailPath
                        : `${BACKEND_URL}/uploads/${video.thumbnailPath}`
                    }
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-6xl">🎬</span>
                  </div>
                )}
                
                {/* Score Badge */}
                {video.score !== undefined && (
                  <div className="absolute top-2 right-2 bg-purple-500/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold">
                    {Math.round(video.score * 100)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-white font-semibold mb-2 line-clamp-2 group-hover:text-purple-400 transition-colors">
                  {video.title}
                </h3>
                
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span className="px-2 py-1 bg-purple-500/20 rounded text-xs">
                    {video.category}
                  </span>
                  <span>👁️ {video.views}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {recommendations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">
              Nenhuma recomendação disponível ainda.
              <br />
              Assista alguns vídeos para construir seu perfil!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

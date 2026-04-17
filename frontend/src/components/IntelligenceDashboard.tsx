import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '@/lib/endpoints';

export const IntelligenceDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('token');

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000); // Atualiza a cada 30s
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/v1/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data);
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar stats:', error);
    }
  };

  const runJob = async () => {
    try {
      await axios.post(
        `${BACKEND_URL}/api/intelligence/run-job`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('✅ Job executado com sucesso!');
      loadStats();
    } catch (error) {
      alert('❌ Erro ao executar job');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              🧠 Intelligence Dashboard
            </h1>
            <p className="text-gray-400">
              Monitoramento do ecossistema adaptativo
            </p>
          </div>

          <button
            onClick={runJob}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
          >
            🔄 Recalcular Scores
          </button>
        </div>

        {/* Métricas Principais */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Total de Vídeos</span>
              <span className="text-3xl">🎬</span>
            </div>
            <p className="text-4xl font-bold text-white">{stats.stats.videos}</p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Usuários</span>
              <span className="text-3xl">👥</span>
            </div>
            <p className="text-4xl font-bold text-white">{stats.stats.users}</p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Views Totais</span>
              <span className="text-3xl">👁️</span>
            </div>
            <p className="text-4xl font-bold text-white">
              {stats.stats.views.toLocaleString()}
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Nodes Ativos</span>
              <span className="text-3xl">🌐</span>
            </div>
            <p className="text-4xl font-bold text-green-400">{stats.stats.activeNodes}</p>
          </div>
        </div>

        {/* Distribuição por Categoria */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">📊 Distribuição por Categoria</h2>
          <div className="space-y-3">
            {stats.categories.map((cat: any) => {
              const percentage = (cat._count._all / stats.stats.videos) * 100;
              return (
                <div key={cat.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-semibold">{cat.category}</span>
                    <span className="text-gray-400">{cat._count._all} vídeos</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Como Funciona */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-purple-500/30">
          <h2 className="text-2xl font-bold text-white mb-4">🔬 Como Funciona</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-purple-400 mb-2">
                1️⃣ Cérebro do Usuário
              </h3>
              <p className="text-gray-300 text-sm">
                Rastreia o que você assiste, quanto tempo, taxa de conclusão.
                Cria um vetor de interesse personalizado.
              </p>
            </div>

            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-green-400 mb-2">
                2️⃣ Cérebro da Rede
              </h3>
              <p className="text-gray-300 text-sm">
                Monitora saúde do swarm: peers, seeds, velocidade.
                Recomenda conteúdo que funciona bem.
              </p>
            </div>

            <div className="bg-gray-900/50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-pink-400 mb-2">
                3️⃣ Cérebro do Sistema
              </h3>
              <p className="text-gray-300 text-sm">
                Combina preferência pessoal + popularidade + saúde da rede.
                Score = (Interesse × 0.6) + (Popularidade × 0.3) + (Swarm × 0.1)
              </p>
            </div>
          </div>

          <div className="mt-6 bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
            <p className="text-purple-300 text-sm">
              💡 <strong>Exploração vs Exploitation:</strong> 10% das recomendações são conteúdo novo
              para evitar "monocultura" e descobrir novos hits.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

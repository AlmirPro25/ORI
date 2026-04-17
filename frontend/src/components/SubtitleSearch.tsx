import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Subtitles,
    Search,
    Download,
    Globe,
    X,
    Loader2,
    Languages,
    FileText
} from 'lucide-react';

interface Subtitle {
    id: string;
    language: string;
    languageCode: string;
    fileName: string;
    downloadUrl: string;
    rating?: number;
    downloadCount: number;
}

interface SubtitleSearchProps {
    movieTitle: string;
    movieYear?: number;
    onSubtitleSelect: (vttUrl: string, language: string) => void;
}

export const SubtitleSearch: React.FC<SubtitleSearchProps> = ({
    movieTitle,
    movieYear,
    onSubtitleSelect
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState('pt-BR');
    const [query, setQuery] = useState(movieTitle);

    const languages = [
        { code: 'pt-BR', name: 'Português (BR)', flag: '🇧🇷' },
        { code: 'en', name: 'English', flag: '🇺🇸' },
        { code: 'es', name: 'Español', flag: '🇪🇸' },
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
        { code: 'it', name: 'Italiano', flag: '🇮🇹' },
        { code: 'ja', name: '日本語', flag: '🇯🇵' },
        { code: 'ko', name: '한국어', flag: '🇰🇷' },
    ];

    const searchSubtitles = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/v1/subtitles/search?q=${encodeURIComponent(query)}&year=${movieYear || ''}&lang=${selectedLanguage}`);
            const data = await response.json();

            if (data.success) {
                setSubtitles(data.subtitles);
            } else {
                setError(data.error || 'Nenhuma legenda encontrada.');
            }
        } catch (e) {
            setError('Falha ao conectar ao servidor de legendas.');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (subtitle: Subtitle) => {
        try {
            setLoading(true);
            console.log(`📥 Baixando legenda real: ${subtitle.fileName}`);

            const response = await fetch('/api/v1/subtitles/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    downloadUrl: subtitle.downloadUrl,
                    videoId: movieTitle.replace(/\s+/g, '_'), // Usando título como ID temporário
                    languageCode: subtitle.languageCode
                })
            });

            const data = await response.json();

            if (data.success) {
                onSubtitleSelect(data.webPath, subtitle.language);
                setIsOpen(false);
            } else {
                setError('Erro ao processar arquivo de legenda.');
            }
        } catch (e) {
            setError('Falha ao baixar legenda.');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateDubbing = async (subtitle: Subtitle) => {
        try {
            setLoading(true);
            const videoId = movieTitle.replace(/\s+/g, '_');

            // 1. Primeiro garante que a legenda está baixada
            const subRes = await fetch('/api/v1/subtitles/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    downloadUrl: subtitle.downloadUrl,
                    videoId: videoId,
                    languageCode: subtitle.languageCode
                })
            });

            const subData = await subRes.json();

            if (!subData.success) throw new Error('Falha ao obter legenda para dublagem');

            // 2. Solicita a geração da dublagem
            const dubRes = await fetch('/api/v1/dubbing/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoId: videoId,
                    targetLanguage: subtitle.languageCode,
                    subtitlePath: subData.srtPath
                })
            });

            const dubData = await dubRes.json();

            if (dubData.success) {
                alert('🎙️ Processo de dublagem iniciado! Isso pode levar alguns minutos. Você será notificado quando o áudio estiver pronto.');
                setIsOpen(false);
            }
        } catch (e: any) {
            setError(`Erro na dublagem: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            searchSubtitles();
        }
    }, [isOpen, selectedLanguage]);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="p-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-primary hover:text-black transition-all group"
                title="Buscar Legendas"
            >
                <Subtitles size={18} className="group-hover:animate-pulse" />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md"
                        />

                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] sm:rounded-3xl bg-gray-900 border border-white/10 shadow-2xl"
                        >
                            <div className="p-4 sm:p-6 border-b border-white/10 bg-black/40">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="p-2 bg-primary/20 rounded-xl">
                                            <Languages className="text-primary" size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
                                                Buscar Legendas
                                            </h3>
                                            <p className="text-[9px] sm:text-[10px] text-gray-500 font-mono uppercase tracking-widest">
                                                OpenSubtitles Integration
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 rounded-xl hover:bg-white/5 transition-colors"
                                    >
                                        <X size={20} className="text-gray-400" />
                                    </button>
                                </div>

                                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                    <div className="flex-1 relative">
                                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Buscar por título..."
                                            className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                                        />
                                    </div>
                                    <button
                                        onClick={searchSubtitles}
                                        disabled={loading}
                                        className="w-full sm:w-auto px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-white transition-colors disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 size={18} className="animate-spin" /> : 'Buscar'}
                                    </button>
                                </div>

                                <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {languages.map((lang) => (
                                        <button
                                            key={lang.code}
                                            onClick={() => setSelectedLanguage(lang.code)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${selectedLanguage === lang.code
                                                ? 'bg-primary text-black'
                                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            <span>{lang.flag}</span>
                                            <span>{lang.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="max-h-[min(60vh,400px)] overflow-y-auto p-3 sm:p-4 space-y-2">
                                {loading && (
                                    <div className="py-12 flex flex-col items-center gap-4">
                                        <Loader2 size={32} className="text-primary animate-spin" />
                                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                                            Buscando legendas...
                                        </p>
                                    </div>
                                )}

                                {error && (
                                    <div className="py-8 text-center">
                                        <p className="text-red-400 text-sm">{error}</p>
                                    </div>
                                )}

                                {!loading && subtitles.length === 0 && (
                                    <div className="py-12 flex flex-col items-center gap-4 opacity-50">
                                        <FileText size={32} />
                                        <p className="text-[10px] uppercase tracking-widest font-bold">
                                            Nenhuma legenda encontrada
                                        </p>
                                    </div>
                                )}

                                {!loading && subtitles.map((sub) => (
                                    <motion.div
                                        key={sub.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="group p-3 sm:p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-primary/30 rounded-2xl transition-all cursor-pointer"
                                        onClick={() => handleDownload(sub)}
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Globe size={12} className="text-primary" />
                                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                                                        {sub.language}
                                                    </span>
                                                    {sub.rating && sub.rating >= 9 && (
                                                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[8px] font-black uppercase rounded">
                                                            Top Rated
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm font-medium truncate text-gray-300">
                                                    {sub.fileName}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] text-gray-500">
                                                    <span>⭐ {sub.rating?.toFixed(1) || 'N/A'}</span>
                                                    <span>📥 {sub.downloadCount.toLocaleString()} downloads</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleGenerateDubbing(sub);
                                                    }}
                                                    className="flex-1 sm:flex-none p-3 bg-primary/10 hover:bg-primary text-primary hover:text-black rounded-xl transition-all"
                                                    title="Gerar Dublagem AI para esta legenda"
                                                >
                                                    <Loader2 size={16} className={loading ? "animate-spin" : "hidden"} />
                                                    <Languages size={16} className={loading ? "hidden" : ""} />
                                                </button>
                                                <button
                                                    className="flex-1 sm:flex-none p-3 bg-primary/10 group-hover:bg-primary text-primary group-hover:text-black rounded-xl transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                    onClick={() => handleDownload(sub)}
                                                >
                                                    <Download size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="p-3 sm:p-4 border-t border-white/10 bg-black/20">
                                <p className="text-[9px] text-gray-600 text-center font-mono uppercase tracking-widest">
                                    Powered by OpenSubtitles • Legendas sincronizadas automaticamente
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

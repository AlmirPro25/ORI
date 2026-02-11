import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Loader2, Mic, MicOff, Zap, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:3000';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    action?: any;
    timestamp?: Date;
}

interface QuickAction {
    icon: string;
    label: string;
    query: string;
}

export const AIChat: React.FC = () => {
    console.log('🤖 AIChat component loaded!');

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isListening, setIsListening] = useState(false);
    const [isCompact, setIsCompact] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [quickActions] = useState<QuickAction[]>([
        { icon: '🔥', label: 'Trending', query: 'me mostra o que está em alta' },
        { icon: '🇧🇷', label: 'PT-BR', query: 'filmes brasileiros' },
        { icon: '📺', label: 'IPTV', query: 'canais de tv ao vivo' },
        { icon: '⚡', label: 'Status', query: 'status do sistema' }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Carregar sugestões
    useEffect(() => {
        axios.get(`${BACKEND_URL}/api/ai-chat/suggestions`)
            .then(res => setSuggestions(res.data.suggestions))
            .catch(() => { });
    }, []);

    // Notificação quando IA responde e chat está fechado
    useEffect(() => {
        if (!isOpen && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg.role === 'assistant') {
                setUnreadCount(prev => prev + 1);
            }
        } else {
            setUnreadCount(0);
        }
    }, [messages, isOpen]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || loading) return;

        const userMessage: Message = {
            role: 'user',
            content: text,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await axios.post(`${BACKEND_URL}/api/ai-chat`, {
                message: text,
                history: messages
            });

            const aiMessage: Message = {
                role: 'assistant',
                content: response.data.message,
                action: response.data.action,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, aiMessage]);

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Desculpa, tive um problema. Tenta de novo?',
                timestamp: new Date()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        sendMessage(suggestion);
    };

    const toggleVoiceRecognition = () => {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            alert('Reconhecimento de voz não suportado neste navegador');
            return;
        }

        if (!recognitionRef.current) {
            const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.lang = 'pt-BR';

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                setIsListening(false);
            };

            recognitionRef.current.onerror = () => {
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const handleQuickAction = (query: string) => {
        sendMessage(query);
    };

    return (
        <>
            {/* Botão Flutuante */}
            {!isOpen && (
                <motion.button
                    onClick={() => {
                        console.log('🎯 Botão clicado!');
                        setIsOpen(true);
                    }}
                    className="sticky bottom-4 left-4 ml-4 mb-4 z-[9999] w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ pointerEvents: 'auto', position: 'fixed' }}
                >
                    <Sparkles className="text-white" size={20} />
                    {unreadCount > 0 && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        >
                            {unreadCount}
                        </motion.div>
                    )}
                </motion.button>
            )}

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className={`fixed bottom-20 left-6 z-[9999] bg-black/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all ${isCompact ? 'w-56 h-56' : 'w-72 h-96'
                            }`}
                        style={{ position: 'fixed' }}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-b border-purple-500/30 p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                    <Sparkles className="text-white" size={16} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-sm">Orion AI</h3>
                                    <p className="text-purple-300 text-xs">
                                        {loading ? 'Pensando...' : 'Online'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsCompact(!isCompact)}
                                    className="text-white/60 hover:text-white transition-colors"
                                    title={isCompact ? 'Expandir' : 'Compactar'}
                                >
                                    <TrendingUp size={14} className={isCompact ? 'rotate-90' : ''} />
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm('Limpar histórico?')) {
                                            setMessages([]);
                                        }
                                    }}
                                    className="text-white/60 hover:text-white transition-colors"
                                    title="Limpar histórico"
                                >
                                    <Zap size={14} />
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="text-white/60 hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {messages.length === 0 && (
                                <div className="text-center text-white/40 text-xs mt-4">
                                    <Sparkles className="mx-auto mb-2" size={24} />
                                    <p>Olá! Sou o Orion AI 🤖</p>
                                    <p className="text-[10px] mt-1">Como posso ajudar?</p>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-3 py-2 ${msg.role === 'user'
                                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                                : 'bg-white/10 text-white border border-white/10'
                                            }`}
                                    >
                                        <p className="text-xs">{msg.content}</p>

                                        {/* Resultados */}
                                        {msg.action?.data?.results && (
                                            <div className="mt-2 space-y-1">
                                                {msg.action.data.results.slice(0, 5).map((item: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        className="bg-black/30 rounded-lg p-2 text-[10px] hover:bg-black/50 cursor-pointer transition-colors border border-white/5"
                                                        onClick={() => {
                                                            if (item.magnetLink || item.magnet) {
                                                                const link = item.magnetLink || item.magnet;
                                                                console.log('🔗 Abrindo Magnet:', link);
                                                                window.open(link, '_self');
                                                            } else if (item.infoHash) {
                                                                window.open(`magnet:?xt=urn:btih:${item.infoHash}`, '_self');
                                                            } else if (item.streamUrl) {
                                                                // IPTV Handling
                                                                console.log('📺 Abrindo IPTV:', item.streamUrl);
                                                                // Copiar para clipboard ou abrir player?
                                                                navigator.clipboard.writeText(item.streamUrl);
                                                                alert(`URL do canal copiada: ${item.name}`);
                                                            } else {
                                                                // Navegação interna
                                                                window.location.href = `/video/${item.id}`;
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <p className="font-bold truncate pr-2">{item.title || item.name}</p>
                                                            {(item.magnetLink || item.magnet || item.infoHash) && (
                                                                <span className="text-pink-500 text-[9px] font-bold">MAGNET</span>
                                                            )}
                                                        </div>

                                                        <div className="flex gap-2 mt-1 opacity-70">
                                                            {item.seeders !== undefined && (
                                                                <p className="text-green-400 text-[9px]">
                                                                    🌱 {item.seeders} seeds
                                                                </p>
                                                            )}
                                                            {item.size && (
                                                                <p className="text-blue-300 text-[9px]">
                                                                    💾 {item.size}
                                                                </p>
                                                            )}
                                                            {item.vote_average && (
                                                                <p className="text-yellow-400 text-[9px]">
                                                                    ⭐ {item.vote_average.toFixed(1)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                {msg.action.data.tip && (
                                                    <p className="text-[9px] text-purple-300 mt-1 italic border-t border-purple-500/20 pt-1">
                                                        {msg.action.data.tip}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            ))}

                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-white/10 rounded-2xl px-3 py-1.5 flex items-center gap-2">
                                        <Loader2 className="animate-spin text-purple-400" size={12} />
                                        <span className="text-white/60 text-xs">Pensando...</span>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick Actions */}
                        {messages.length === 0 && (
                            <div className="px-3 pb-2">
                                <p className="text-white/40 text-[10px] mb-2">Ações Rápidas:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {quickActions.map((action, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleQuickAction(action.query)}
                                            className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-lg p-2 hover:from-purple-500/30 hover:to-pink-500/30 transition-all"
                                        >
                                            <div className="text-lg">{action.icon}</div>
                                            <div className="text-white text-[10px] font-bold">{action.label}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggestions */}
                        {messages.length === 0 && suggestions.length > 0 && (
                            <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto">
                                {suggestions.slice(0, 2).map((sug, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSuggestionClick(sug)}
                                        className="flex-shrink-0 text-[10px] bg-purple-500/20 text-purple-300 px-2 py-1 rounded-full hover:bg-purple-500/30 transition-colors border border-purple-500/30"
                                    >
                                        {sug.length > 20 ? sug.substring(0, 20) + '...' : sug}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Input */}
                        <div className="border-t border-purple-500/30 p-3">
                            <div className="flex gap-2">
                                <button
                                    onClick={toggleVoiceRecognition}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isListening
                                            ? 'bg-red-500 animate-pulse'
                                            : 'bg-purple-500/20 hover:bg-purple-500/30'
                                        }`}
                                    title="Comando de voz"
                                >
                                    {isListening ? <MicOff size={14} className="text-white" /> : <Mic size={14} className="text-purple-300" />}
                                </button>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
                                    placeholder={isListening ? "Ouvindo..." : "Digite..."}
                                    className="flex-1 bg-white/10 border border-white/20 rounded-full px-3 py-1.5 text-white text-xs placeholder-white/40 focus:outline-none focus:border-purple-500/50"
                                    disabled={loading || isListening}
                                />
                                <button
                                    onClick={() => sendMessage(input)}
                                    disabled={loading || !input.trim()}
                                    className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center hover:scale-110 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send size={14} className="text-white" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

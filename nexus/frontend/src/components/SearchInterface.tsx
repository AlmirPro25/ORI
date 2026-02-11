"use client";

import { useState } from 'react';
import { useSearch } from '@/hooks/useSearch';
import { Input, Button } from '@/components/ui/primitives';
import { Search, Terminal, Activity, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function SearchInterface() {
    const { executeSearch, isLoading, error, searchInputRef } = useSearch();
    const [localTerm, setLocalTerm] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!localTerm) return;
        executeSearch(localTerm);
    };

    return (
        <div className="w-full max-w-4xl mx-auto my-12 relative group z-10">
            <div className="absolute -inset-1 bg-gradient-to-r from-nexus-dim via-nexus-accent to-nexus-dim rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>

            <form onSubmit={handleSubmit} className="relative flex items-center bg-nexus-bg border border-nexus-border rounded-lg p-2 shadow-2xl">
                <div className="pl-4 pr-2 text-nexus-accent">
                    <Terminal size={20} className={isLoading ? "animate-pulse" : ""} />
                </div>

                <Input
                    ref={searchInputRef}
                    autoFocus
                    className="border-none bg-transparent focus-visible:ring-0 text-lg h-14"
                    placeholder="CONECTAR AO NEXO PROFUNDO..."
                    value={localTerm}
                    onChange={(e) => setLocalTerm(e.target.value)}
                    disabled={isLoading}
                />

                <Button
                    type="submit"
                    size="lg"
                    className="ml-2 min-w-[120px]"
                    disabled={isLoading}
                >
                    {isLoading ? <Activity className="animate-spin mr-2 h-4 w-4" /> : <Search className="mr-2 h-4 w-4" />}
                    {isLoading ? 'SCAN' : 'EXEC'}
                </Button>
            </form>

            <div className="flex justify-between px-2 mt-2 font-mono text-xs text-nexus-muted uppercase tracking-tighter">
                <span>Status: {isLoading ? 'Infiltrando...' : 'Aguardando Comandos'}</span>
                <span>Latência: Otimizada</span>
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 p-4 bg-red-500/10 border border-red-500/30 text-red-500 rounded-lg flex items-center gap-3 font-mono text-sm"
                    >
                        <XCircle size={18} />
                        <span className="uppercase tracking-tighter">Erro de Protocolo: {error}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

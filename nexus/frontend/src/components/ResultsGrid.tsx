"use client";

import { useSearch } from '@/hooks/useSearch';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, HardDrive, Database, Network, Circle } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui/primitives';

export function ResultsGrid() {
    const { results, isLoading, sourceType, isEmpty } = useSearch();

    const handleCopy = (magnet: string) => {
        navigator.clipboard.writeText(magnet);
        alert("MAGNET COPIADO.");
    };

    if (isLoading) {
        return (
            <div className="w-full h-48 border border-nexus-border bg-nexus-card/50 relative overflow-hidden flex flex-col items-center justify-center rounded-lg">
                <div className="w-full h-1 bg-nexus-accent absolute top-0 animate-scan-vertical"></div>
                <div className="font-mono text-nexus-accent text-lg tracking-widest animate-pulse">SINTETIZANDO DADOS</div>
            </div>
        );
    }

    if (isEmpty) {
        return (
            <div className="text-center py-20 text-nexus-muted font-mono uppercase text-xs tracking-[0.2em]">
                Nenhum registro encontrado no nexo.
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <AnimatePresence>
                {results.length > 0 && (
                    <>
                        <div className="flex justify-between items-center border-b border-nexus-border pb-4">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest">
                                <Database className="w-4 h-4 text-nexus-accent" />
                                Extração Concluída
                            </h2>
                            <div className="text-[10px] font-mono flex items-center gap-4">
                                <span className="text-nexus-muted uppercase">Fonte: ${sourceType}</span>
                                <span className="text-nexus-accent">${results.length} Itens</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {results.map((item, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <Card className="hover:border-nexus-accent/30 transition-all bg-nexus-card/50 backdrop-blur-sm">
                                        <CardContent className="p-4 flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-bold text-nexus-text truncate uppercase italic">${item.title}</h3>
                                                <div className="flex items-center gap-4 text-[10px] font-mono text-nexus-muted mt-1 uppercase">
                                                    <span className="flex items-center gap-1"><HardDrive size={10} /> ${item.size}</span>
                                                    <span className="flex items-center gap-1 text-nexus-accent"><Network size={10} /> ${item.seeds} Seeds</span>
                                                    <span className="text-[8px] border border-nexus-border px-1">${item.sourceSite}</span>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" onClick={() => handleCopy(item.magnetLink)}>
                                                <Copy size={12} className="mr-2" /> Magnet
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}


import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Puzzle, Plus, Trash2, Check, ExternalLink } from 'lucide-react';
import { addonService, Addon } from '@/services/addon.service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export const AddonsPage: React.FC = () => {
    const [addons, setAddons] = useState<Addon[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInstalling, setIsInstalling] = useState(false);
    const [addonUrl, setAddonUrl] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        loadAddons();
    }, []);

    const loadAddons = async () => {
        try {
            setLoading(true);
            const data = await addonService.getAddons();
            setAddons(data);
        } catch (error) {
            console.error('Falha ao carregar addons');
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async () => {
        if (!addonUrl) return;

        try {
            setIsInstalling(true);
            await addonService.installAddon(addonUrl);
            alert('Addon instalado com sucesso!');
            setAddonUrl('');
            setIsDialogOpen(false);
            loadAddons();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Erro ao instalar addon');
        } finally {
            setIsInstalling(false);
        }
    };

    const handleRemove = async (id: string, name: string) => {
        if (!window.confirm(`Tem certeza que deseja remover o addon "${name}"?`)) return;

        try {
            await addonService.removeAddon(id);
            setAddons(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            alert('Erro ao remover addon');
        }
    };

    return (
        <div className="container mx-auto px-4 sm:px-6 py-8 max-w-7xl pt-24">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
                        <Puzzle className="text-cyan-400" />
                        Stremio Addons
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Expanda as capacidades do seu sistema nexus instalando addons oficiais e da comunidade do Stremio.
                    </p>
                </div>

                <Button onClick={() => setIsDialogOpen(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white gap-2 w-full sm:w-auto">
                    <Plus size={18} /> Instalar Addon
                </Button>
            </div>

            {/* Simple Modal */}
            {isDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-4 sm:p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Puzzle className="text-cyan-400" size={20} />
                            Instalar Novo Addon
                        </h2>

                        <div className="space-y-4 mb-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-400">URL do Manifesto</label>
                                <Input
                                    placeholder="https://exemplo.com/manifest.json"
                                    value={addonUrl}
                                    onChange={(e) => setAddonUrl(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-white focus:ring-cyan-500"
                                />
                                <p className="text-xs text-gray-500">
                                    Insira a URL completa do manifesto do addon (terminado em .json)
                                </p>
                            </div>

                            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex gap-3 text-sm text-blue-300">
                                <Check className="mt-1 flex-shrink-0" size={16} />
                                <div>
                                    <p className="font-semibold">Dica:</p>
                                    <p>Você pode encontrar URLs de addons em <a href="https://stremio-addons.net" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">stremio-addons.net</a>. Copie o link do botão "Install" (botão direito -&gt; copiar link).</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-end gap-3">
                            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="hover:bg-gray-800 text-gray-300">
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleInstall}
                                disabled={!addonUrl || isInstalling}
                                className="bg-cyan-600 hover:bg-cyan-700 text-white min-w-[100px]"
                            >
                                {isInstalling ? 'Instalando...' : 'Instalar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lista de Addons */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
                </div>
            ) : addons.length === 0 ? (
                <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-dashed border-gray-700">
                    <Puzzle className="mx-auto h-16 w-16 text-gray-600 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-300 mb-2">Nenhum addon instalado</h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">
                        Instale addons para acessar catálogos de filmes, séries, animes e muito mais.
                    </p>
                    <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="border-cyan-600 text-cyan-400 hover:bg-cyan-950">
                        Instalar meu primeiro addon
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <AnimatePresence>
                        {addons.map((addon) => (
                            <motion.div
                                key={addon.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-colors group"
                            >
                                <div className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            {addon.icon ? (
                                                <img src={addon.icon} alt={addon.name} className="w-12 h-12 rounded-lg object-contain bg-gray-800" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-cyan-500">
                                                    <Puzzle size={24} />
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-bold text-white text-lg line-clamp-1">{addon.name}</h3>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                                                    v{addon.version}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemove(addon.id, addon.name)}
                                            className="text-gray-500 hover:text-red-400 hover:bg-red-950/30 -mt-2 -mr-2"
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>

                                    <p className="text-gray-400 text-sm mb-4 line-clamp-3 min-h-[3rem]">
                                        {addon.description || 'Sem descrição disponível.'}
                                    </p>

                                    <div className="flex items-center justify-between pt-4 border-t border-gray-800 mt-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${addon.enabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                            <span className="text-xs text-gray-400">{addon.enabled ? 'Ativo' : 'Desativado'}</span>
                                        </div>
                                        <a
                                            href={addon.manifestUrl.replace('/manifest.json', '')}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-cyan-500 hover:underline flex items-center gap-1"
                                        >
                                            Visitar Site <ExternalLink size={10} />
                                        </a>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

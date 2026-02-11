import { useState } from 'react';
import { X, Upload, FileVideo, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import VideoService from '../services/api/video.service';

export default function UploadModal({ isOpen, onClose, onComplete }: { isOpen: boolean, onClose: () => void, onComplete: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setStatus('uploading');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title || file.name);

        try {
            await VideoService.upload(formData as any);
            setStatus('success');
            setTimeout(() => {
                onComplete();
                onClose();
                reset();
            }, 2000);
        } catch (error) {
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setFile(null);
        setTitle('');
        setStatus('idle');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
                    >
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Upload size={20} className="text-blue-500" /> Ingestão de Ativo
                            </h2>
                            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="p-8">
                            {status === 'idle' || status === 'uploading' ? (
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Título do Recurso</label>
                                        <input
                                            type="text"
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="Ex: Trailer_Core_Engine_v1.mp4"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-600 transition-colors"
                                        />
                                    </div>

                                    <div
                                        className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all ${file ? 'border-blue-600/50 bg-blue-600/5' : 'border-slate-800 hover:border-slate-700'
                                            }`}
                                    >
                                        <input
                                            type="file"
                                            id="video-upload"
                                            className="hidden"
                                            accept="video/*"
                                            onChange={e => setFile(e.target.files?.[0] || null)}
                                        />
                                        <label htmlFor="video-upload" className="cursor-pointer flex flex-col items-center">
                                            <div className={`p-4 rounded-full mb-4 ${file ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                                <FileVideo size={32} />
                                            </div>
                                            <p className="font-bold text-lg mb-1">{file ? file.name : 'Clique para selecionar'}</p>
                                            <p className="text-slate-500 text-sm">MP4, MKV ou MOV (Máx 2GB)</p>
                                        </label>
                                    </div>

                                    <button
                                        disabled={!file || loading}
                                        onClick={handleUpload}
                                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="animate-spin" size={20} />
                                                Processando Ingestão...
                                            </>
                                        ) : (
                                            'Iniciar Processamento'
                                        )}
                                    </button>
                                </div>
                            ) : status === 'success' ? (
                                <div className="py-12 flex flex-col items-center text-center">
                                    <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-6">
                                        <CheckCircle2 size={48} />
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2">Upload Concluído!</h3>
                                    <p className="text-slate-400">O worker industrial já iniciou a transcodificação HLS.</p>
                                </div>
                            ) : (
                                <div className="py-12 flex flex-col items-center text-center">
                                    <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6">
                                        <AlertCircle size={48} />
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2">Erro na Ingestão</h3>
                                    <p className="text-slate-400 mb-6">Não foi possível conectar ao servidor de processamento.</p>
                                    <button onClick={() => setStatus('idle')} className="text-blue-500 font-bold hover:underline">Tentar novamente</button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

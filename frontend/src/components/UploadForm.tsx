import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useVideoUpload } from '@/hooks/useVideos';
import { cn } from '@/lib/utils';
import { UploadCloud, FileVideo, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const uploadSchema = z.object({
    title: z.string().min(1, 'O título é obrigatório.'),
    description: z.string().optional(),
    category: z.string().default('Geral'),
    file: z
        .instanceof(FileList)
        .refine((files) => files?.length > 0, "O vídeo é obrigatório.")
        .transform((files) => files[0]),
    thumbnail: z
        .instanceof(FileList)
        .optional()
        .transform((files) => (files && files.length > 0 ? files[0] : undefined)),
});

type UploadFormData = z.infer<typeof uploadSchema>;

export const UploadForm: React.FC<{ onUploadSuccess?: () => void }> = ({ onUploadSuccess }) => {
    const { upload, uploading, progress, error: uploadError } = useVideoUpload();
    const [success, setSuccess] = useState(false);

    const { register, handleSubmit, watch, formState: { errors }, reset } = useForm<UploadFormData>({
        resolver: zodResolver(uploadSchema),
    });

    const watchedFiles = watch('file');
    const watchedThumb = watch('thumbnail');

    const onSubmit = async (data: UploadFormData) => {
        try {
            await upload(data as any);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                reset();
                if (onUploadSuccess) onUploadSuccess();
            }, 3000);
        } catch (err) {
            console.error('Upload failed:', err);
        }
    };

    return (
        <Card className="glass-card border-white/5 overflow-hidden rounded-[3rem] shadow-2xl relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[80px] -z-10" />

            <CardHeader className="bg-white/5 border-b border-white/5 p-10">
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 backdrop-blur-3xl">
                        <UploadCloud className="text-primary w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-black uppercase italic tracking-tight">
                            Asset <span className="text-gradient-primary">Ingestion</span>
                        </CardTitle>
                        <CardDescription className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">Configure Forge Processing Pipeline</CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-10">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
                    <div className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase tracking-[0.4em] font-black text-white/40 ml-1">Asset Title</Label>
                                <Input
                                    {...register('title')}
                                    placeholder="Ex: OPERATION INFRA FORGE"
                                    className="h-14 bg-white/5 border-white/10 rounded-2xl focus:ring-primary/40 focus:border-primary/40 text-sm font-medium placeholder:text-white/10"
                                />
                                {errors.title && <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest pl-1">{String(errors.title.message)}</p>}
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase tracking-[0.4em] font-black text-white/40 ml-1">Nexus Category</Label>
                                <select
                                    {...register('category')}
                                    className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-sm font-medium focus:ring-1 focus:ring-primary/40 outline-none hover:bg-white/10 transition-colors appearance-none text-white italic"
                                >
                                    <option value="Geral" className="bg-[#0a0a0b]">Geral</option>
                                    <option value="Ação" className="bg-[#0a0a0b]">Ação</option>
                                    <option value="Documentário" className="bg-[#0a0a0b]">Documentário</option>
                                    <option value="Série" className="bg-[#0a0a0b]">Série</option>
                                    <option value="Tecnologia" className="bg-[#0a0a0b]">Tecnologia</option>
                                    <option value="Originals" className="bg-[#0a0a0b]">Originals</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[10px] uppercase tracking-[0.4em] font-black text-white/40 ml-1">Technical specification (Synopsis)</Label>
                            <Textarea
                                {...register('description')}
                                placeholder="Descreva o conteúdo técnico para o indexador neural..."
                                className="bg-white/5 border-white/10 rounded-2xl min-h-[120px] focus:ring-primary/40 focus:border-primary/40 text-sm font-medium placeholder:text-white/10 p-4"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Input de Vídeo */}
                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase tracking-[0.4em] font-black text-white/40 ml-1">Binary Source (MP4)</Label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="video/mp4,video/x-m4v,video/*"
                                        {...register('file')}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="h-32 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all duration-500 bg-white/5">
                                        <div className={cn("p-2 rounded-lg transition-colors", watchedFiles ? "bg-primary text-black" : "bg-white/5 text-white/20")}>
                                            <FileVideo size={20} />
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-center px-4 truncate max-w-full italic">
                                            {watchedFiles && (watchedFiles as any)[0] ? (watchedFiles as any)[0].name : "Select Binary Source"}
                                        </span>
                                    </div>
                                </div>
                                {errors.file && <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest pl-1">O vídeo é obrigatório</p>}
                            </div>

                            {/* Input de Thumbnail */}
                            <div className="space-y-3">
                                <Label className="text-[10px] uppercase tracking-[0.4em] font-black text-white/40 ml-1">Visual Poster (JPG/PNG)</Label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        {...register('thumbnail')}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="h-32 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3 group-hover:border-primary/50 group-hover:bg-primary/5 transition-all duration-500 bg-white/5">
                                        <div className={cn("p-2 rounded-lg transition-colors", watchedThumb ? "bg-primary text-black" : "bg-white/5 text-white/20")}>
                                            <ImageIcon size={20} />
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-center px-4 truncate max-w-full italic">
                                            {watchedThumb && (watchedThumb as any)[0] ? (watchedThumb as any)[0].name : "Select Visual ID"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {uploading && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="space-y-4 p-8 bg-black/40 rounded-3xl border border-primary/20 backdrop-blur-3xl shadow-glow-sm"
                            >
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
                                        Streaming Binary Packets...
                                    </div>
                                    <span className="text-lg italic">{progress}%</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                    <motion.div
                                        className="h-full bg-primary shadow-glow"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                    />
                                </div>
                            </motion.div>
                        )}

                        {success && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-6 bg-green-500/5 border border-green-500/20 rounded-2xl flex items-center gap-4 text-green-500 text-[10px] font-black uppercase tracking-[0.2em]"
                            >
                                <CheckCircle size={20} className="animate-bounce" /> Uplink established. Asset forged successfully.
                            </motion.div>
                        )}

                        {uploadError && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-500 text-[10px] font-black uppercase tracking-[0.2em]"
                            >
                                <AlertCircle size={20} /> Neural failure: {uploadError}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Button
                        type="submit"
                        disabled={uploading}
                        className="w-full h-20 rounded-[1.8rem] text-xs font-black uppercase tracking-[0.4em] italic bg-white text-black hover:bg-primary transition-all shadow-2xl active:scale-95 group relative overflow-hidden"
                    >
                        <span className="relative z-10">{uploading ? 'Processing Signal...' : 'Initialize Transcoding Sequence'}</span>
                        <div className="absolute inset-0 bg-primary translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};

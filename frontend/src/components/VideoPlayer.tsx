import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { X, Maximize, Settings } from 'lucide-react';

export default function VideoPlayer({ url, title, onClose }: { url: string, title: string, onClose: () => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        let hls: Hls;
        if (videoRef.current) {
            const video = videoRef.current;

            if (Hls.isSupported()) {
                hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                });
                hls.loadSource(url);
                hls.attachMedia(video);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
            }
        }

        return () => {
            if (hls) hls.destroy();
        };
    }, [url]);

    return (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
            <div className="p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                    <div>
                        <h2 className="font-bold text-lg leading-none">{title}</h2>
                        <span className="text-xs text-blue-500 font-mono">STREAMING HLS INDUSTRIAL</span>
                    </div>
                </div>
                <div className="flex gap-4">
                    <Settings size={20} className="text-slate-400" />
                    <Maximize size={20} className="text-slate-400" />
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <video
                    ref={videoRef}
                    controls
                    autoPlay
                    className="w-full max-h-screen aspect-video"
                    poster="/poster-placeholder.jpg"
                />
            </div>

            {/* Custom Overlays podem ser adicionados aqui */}
        </div>
    );
}

import { SearchInterface } from '@/components/SearchInterface';
import { ResultsGrid } from '@/components/ResultsGrid';

export default function Home() {
    return (
        <main className="min-h-screen bg-nexus-bg text-nexus-text selection:bg-nexus-accent selection:text-black">
            <div className="max-w-7xl mx-auto px-4 py-16">
                <header className="mb-20 text-center space-y-6">
                    <div className="relative inline-block">
                        <h1 className="text-5xl md:text-7xl font-black font-mono tracking-tighter text-white uppercase italic">
                            NEXUS <span className="text-nexus-accent">DEEP</span> SEARCH
                        </h1>
                        <div className="absolute -right-6 -top-2 w-3 h-3 bg-nexus-accent animate-ping rounded-full"></div>
                    </div>
                    <p className="text-nexus-muted font-mono text-xs uppercase tracking-[0.4em] max-w-2xl mx-auto opacity-70">
                        Interface de Extração P2P Descentralizada // v3.0 // Stealth Mode Active
                    </p>
                </header>

                <SearchInterface />
                <ResultsGrid />
            </div>

            <footer className="py-10 border-t border-nexus-border/30 text-center">
                <p className="text-[10px] font-mono text-nexus-muted uppercase tracking-widest opacity-40">
                    Arquitetura Arconte // Operação Sem Rastro // Liberdade de Informação
                </p>
            </footer>
        </main>
    );
}

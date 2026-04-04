import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface FeatureErrorBoundaryProps {
    children: React.ReactNode;
    title?: string;
    description?: string;
    className?: string;
}

interface FeatureErrorBoundaryState {
    hasError: boolean;
}

export class FeatureErrorBoundary extends React.Component<FeatureErrorBoundaryProps, FeatureErrorBoundaryState> {
    state: FeatureErrorBoundaryState = {
        hasError: false,
    };

    static getDerivedStateFromError(): FeatureErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[FeatureErrorBoundary]', error, errorInfo);
    }

    private handleRetry = () => {
        this.setState({ hasError: false });
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div className={this.props.className || 'w-full h-full flex items-center justify-center bg-black/80'}>
                <div className="max-w-md text-center px-6 py-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl space-y-5">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-300 flex items-center justify-center">
                        <AlertTriangle size={28} />
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-white font-black uppercase tracking-[0.2em] text-sm">
                            {this.props.title || 'Modulo instavel isolado'}
                        </h3>
                        <p className="text-white/55 text-sm leading-relaxed">
                            {this.props.description || 'Esta parte falhou, mas o restante da pagina continua disponivel.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.handleRetry}
                        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-2xl bg-white text-black font-black uppercase tracking-[0.18em] text-[10px] hover:bg-white/90 transition-colors"
                    >
                        <RefreshCw size={14} />
                        Tentar novamente
                    </button>
                </div>
            </div>
        );
    }
}

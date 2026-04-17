import { useEffect, useRef } from 'react';
import { useNexusStore } from '@/stores/nexus-store';

export function useSearch() {
    const store = useNexusStore();
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            if (e.key === 'Escape') {
                store.clearResults();
                searchInputRef.current?.blur();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [store]);

    return {
        ...store,
        searchInputRef,
        hasResults: store.results.length > 0,
        isEmpty: !store.isLoading && store.results.length === 0 && store.sourceType !== 'idle' && !store.error,
    };
}

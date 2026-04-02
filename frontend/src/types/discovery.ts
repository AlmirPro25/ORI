export interface DiscoveryItem {
    kind: 'video' | 'series';
    id: string;
    title: string;
    subtitle: string;
    image: string;
    backdrop?: string;
    href: string;
    badge: string;
    score: number;
    status: string;
    category: string;
    quality?: string;
    views?: number;
    isPortuguese?: boolean;
    isDubbed?: boolean;
    isKidsSafe?: boolean;
    isFamilySafe?: boolean;
    isAdult?: boolean;
    safetyLabel?: 'kids-safe' | 'family-safe' | 'adult' | 'general';
    tags?: string[];
    createdAt: string;
}

export interface DiscoveryRow {
    id: string;
    title: string;
    subtitle: string;
    items: DiscoveryItem[];
}

export interface DiscoveryFeed {
    featured: DiscoveryItem | null;
    rows: DiscoveryRow[];
    movies: DiscoveryItem[];
    series: DiscoveryItem[];
    spotlight: DiscoveryItem[];
    audienceProfile?: string;
}

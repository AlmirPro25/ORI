import React from 'react';
import { cn } from '@/lib/utils';

type ExperienceLoaderVariant = 'generic' | 'home' | 'catalog' | 'detail' | 'search' | 'player';

interface ExperienceLoaderProps {
    label: string;
    className?: string;
    compact?: boolean;
    variant?: ExperienceLoaderVariant;
}

const pulseLine = (width: string) => (
    <div className={cn('h-3 rounded-full bg-white/10 animate-pulse', width)} />
);

const CatalogSkeleton = () => (
    <div className="w-full max-w-6xl space-y-8">
        <div className="space-y-3">
            <div className="h-3 w-32 rounded-full bg-primary/20 animate-pulse" />
            <div className="h-10 w-64 rounded-full bg-white/10 animate-pulse" />
            <div className="h-4 w-48 rounded-full bg-white/10 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
                <div
                    key={index}
                    className="space-y-3 rounded-[1.4rem] border border-white/5 bg-white/[0.03] p-3"
                >
                    <div className="aspect-[2/3] rounded-[1rem] bg-white/10 animate-pulse" />
                    {pulseLine('w-5/6')}
                    {pulseLine('w-2/3')}
                </div>
            ))}
        </div>
    </div>
);

const HomeSkeleton = () => (
    <div className="w-full max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.03]">
            <div className="h-[30vh] sm:h-[36vh] md:h-[44vh] bg-gradient-to-br from-primary/15 via-white/[0.04] to-transparent animate-pulse" />
            <div className="space-y-4 p-5 sm:p-6 md:p-8">
                <div className="h-3 w-36 rounded-full bg-primary/20 animate-pulse" />
                <div className="h-10 w-3/4 rounded-full bg-white/10 animate-pulse" />
                <div className="flex flex-wrap gap-3">
                    <div className="h-11 w-36 rounded-2xl bg-primary/20 animate-pulse" />
                    <div className="h-11 w-28 rounded-2xl bg-white/10 animate-pulse" />
                </div>
            </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[1.8rem] border border-white/5 bg-white/[0.03] p-5">
                <div className="space-y-3">
                    {pulseLine('w-28')}
                    {pulseLine('w-full')}
                    {pulseLine('w-4/5')}
                </div>
            </div>
            <div className="rounded-[1.8rem] border border-white/5 bg-white/[0.03] p-5">
                <div className="space-y-3">
                    {pulseLine('w-24')}
                    {pulseLine('w-full')}
                    {pulseLine('w-3/5')}
                </div>
            </div>
        </div>
        <div className="space-y-4">
            <div className="h-4 w-44 rounded-full bg-white/10 animate-pulse" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="space-y-3 rounded-[1.4rem] border border-white/5 bg-white/[0.03] p-3">
                        <div className="aspect-[2/3] rounded-[1rem] bg-white/10 animate-pulse" />
                        {pulseLine('w-5/6')}
                        {pulseLine('w-2/3')}
                    </div>
                ))}
            </div>
        </div>
    </div>
);

const DetailSkeleton = () => (
    <div className="w-full max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-white/[0.03]">
            <div className="h-[32vh] sm:h-[40vh] md:h-[48vh] bg-gradient-to-br from-white/10 via-white/[0.03] to-transparent animate-pulse" />
            <div className="space-y-4 p-5 sm:p-7 md:p-10">
                <div className="h-3 w-28 rounded-full bg-primary/20 animate-pulse" />
                <div className="h-10 w-4/5 rounded-full bg-white/10 animate-pulse" />
                <div className="space-y-3">
                    {pulseLine('w-full')}
                    {pulseLine('w-11/12')}
                    {pulseLine('w-8/12')}
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                    <div className="h-12 w-40 rounded-2xl bg-primary/20 animate-pulse" />
                    <div className="h-12 w-32 rounded-2xl bg-white/10 animate-pulse" />
                </div>
            </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-[1.6rem] border border-white/5 bg-white/[0.03] p-4 sm:p-5">
                        <div className="space-y-3">
                            {pulseLine('w-24')}
                            {pulseLine('w-4/5')}
                            {pulseLine('w-3/5')}
                        </div>
                    </div>
                ))}
            </div>
            <div className="space-y-4">
                <div className="rounded-[1.8rem] border border-white/5 bg-white/[0.03] p-5">
                    <div className="space-y-3">
                        {pulseLine('w-24')}
                        {pulseLine('w-full')}
                        {pulseLine('w-4/5')}
                    </div>
                </div>
            </div>
        </div>
    </div>
);

const SearchSkeleton = () => (
    <div className="w-full max-w-7xl space-y-8">
        <div className="rounded-[2rem] border border-white/10 bg-black/30 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row">
                <div className="h-12 flex-1 rounded-2xl bg-white/10 animate-pulse sm:h-14" />
                <div className="h-12 w-full rounded-2xl bg-primary/20 animate-pulse sm:h-14 sm:w-36" />
            </div>
        </div>
        <div className="space-y-3">
            <div className="h-3 w-40 rounded-full bg-primary/20 animate-pulse" />
            <div className="h-10 w-72 rounded-full bg-white/10 animate-pulse" />
            <div className="h-4 w-52 rounded-full bg-white/10 animate-pulse" />
        </div>
        <div className="space-y-10">
            {Array.from({ length: 3 }).map((_, sectionIndex) => (
                <div key={sectionIndex} className="space-y-4">
                    <div className="h-4 w-44 rounded-full bg-white/10 animate-pulse" />
                    <div className="flex gap-4 overflow-hidden">
                        {Array.from({ length: 4 }).map((__, cardIndex) => (
                            <div
                                key={cardIndex}
                                className="w-[17rem] flex-shrink-0 rounded-[1.5rem] border border-white/5 bg-white/[0.03] p-4"
                            >
                                <div className="space-y-3">
                                    <div className="aspect-video rounded-[1rem] bg-white/10 animate-pulse" />
                                    {pulseLine('w-5/6')}
                                    {pulseLine('w-2/3')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const PlayerSkeleton = ({ compact }: { compact: boolean }) => (
    <div
        className={cn(
            'w-full rounded-[1.8rem] border border-white/10 bg-black/70 p-4 backdrop-blur-xl',
            compact ? 'max-w-md' : 'max-w-3xl'
        )}
    >
        <div className={cn('space-y-4', compact ? 'space-y-3' : 'space-y-5')}>
            <div className={cn('rounded-[1.2rem] bg-white/10 animate-pulse', compact ? 'h-32' : 'aspect-video')} />
            <div className="flex items-center justify-between gap-3">
                <div className="flex flex-1 gap-2">
                    <div className="h-10 w-10 rounded-full bg-primary/20 animate-pulse" />
                    <div className="h-10 w-10 rounded-full bg-white/10 animate-pulse" />
                    <div className="h-10 w-20 rounded-full bg-white/10 animate-pulse" />
                </div>
                <div className="h-3 w-24 rounded-full bg-white/10 animate-pulse" />
            </div>
        </div>
    </div>
);

const GenericSkeleton = ({ compact }: { compact: boolean }) => (
    <div
        className={cn(
            'rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl',
            compact ? 'px-4 py-3' : 'px-5 py-4'
        )}
    >
        <div className="mx-auto mb-3 h-2 w-2 animate-pulse rounded-full bg-primary" />
        <div className="space-y-2">
            {pulseLine('w-28')}
            {pulseLine('w-20')}
        </div>
    </div>
);

const renderVariant = (variant: ExperienceLoaderVariant, compact: boolean) => {
    switch (variant) {
        case 'home':
            return <HomeSkeleton />;
        case 'catalog':
            return <CatalogSkeleton />;
        case 'detail':
            return <DetailSkeleton />;
        case 'search':
            return <SearchSkeleton />;
        case 'player':
            return <PlayerSkeleton compact={compact} />;
        default:
            return <GenericSkeleton compact={compact} />;
    }
};

export const ExperienceLoader: React.FC<ExperienceLoaderProps> = ({
    label,
    className,
    compact = false,
    variant = 'generic',
}) => {
    return (
        <div
            className={cn(
                'flex items-center justify-center px-4 text-center',
                compact ? 'min-h-[4rem]' : 'min-h-[50vh]',
                className
            )}
        >
            <div className="w-full space-y-4">
                {renderVariant(variant, compact)}
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">{label}</p>
            </div>
        </div>
    );
};

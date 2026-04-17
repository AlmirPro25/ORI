import React from 'react';
import { VideoList } from '@/components/VideoList';
import { HeroSection } from '@/components/HeroSection';
import { UploadForm } from '@/components/UploadForm';
import { Recommendations } from '@/components/Recommendations';
import { RecentlyAdded } from '@/components/RecentlyAdded';
import { ContinueWatching } from '@/components/ContinueWatching';
import { HouseholdProfileSelector } from '@/components/HouseholdProfileSelector';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { LiveTVRow } from '@/components/LiveTVRow';

export const HomePage: React.FC = () => {
  const [showUpload, setShowUpload] = React.useState(false);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-20">
      {/* Hero Central */}
      <HeroSection />

      {/* Perfil da Casa */}
      <HouseholdProfileSelector />

      {/* IPTV TV AO VIVO */}
      <LiveTVRow />

      {/* Recém Adicionados pelo Arconte */}
      <RecentlyAdded />

      {/* Continuar Assistindo */}
      <ContinueWatching />

      {/* Recomendações Inteligentes */}
      <Recommendations />

      {/* Main Content (Row Layout) */}
      <VideoList />

      {/* Floating Upload Button */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 md:bottom-10 md:right-10 z-[100]">
        <Button
          onClick={() => setShowUpload(true)}
          className="rounded-[1.4rem] sm:rounded-[1.6rem] md:rounded-[2.2rem] w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 shadow-glow bg-primary text-black hover:scale-110 transition-all border border-primary/20 group flex items-center justify-center p-0"
        >
          <Plus size={24} className="sm:w-7 sm:h-7 md:w-9 md:h-9 group-hover:rotate-90 transition-transform duration-500" />
        </Button>
      </div>

      {/* Overlay Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-xl relative"
            >
              <button
                onClick={() => setShowUpload(false)}
                className="absolute -top-9 sm:-top-10 md:-top-12 right-1 sm:right-0 text-white hover:text-primary transition-colors"
              >
                <X size={28} className="sm:w-8 sm:h-8" />
              </button>
              <UploadForm onUploadSuccess={() => setShowUpload(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

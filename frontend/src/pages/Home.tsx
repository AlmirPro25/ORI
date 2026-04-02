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
    <div className="min-h-screen bg-background pb-20">
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
      <div className="fixed bottom-10 right-10 z-[100]">
        <Button
          onClick={() => setShowUpload(true)}
          className="rounded-[2.2rem] w-20 h-20 shadow-glow bg-primary text-black hover:scale-110 transition-all border border-primary/20 group flex items-center justify-center p-0"
        >
          <Plus size={36} className="group-hover:rotate-90 transition-transform duration-500" />
        </Button>
      </div>

      {/* Overlay Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-xl relative"
            >
              <button
                onClick={() => setShowUpload(false)}
                className="absolute -top-12 right-0 text-white hover:text-primary transition-colors"
              >
                <X size={32} />
              </button>
              <UploadForm onUploadSuccess={() => setShowUpload(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HomePage } from '@/pages/Home';
import { AuthPage } from '@/pages/Auth';
import { VideoDetailsPage } from '@/pages/VideoDetails';
import { SearchPage } from '@/pages/Search';
import { AdminPage } from '@/pages/Admin';
import { MyList } from '@/pages/MyList';
import { TorrentSearch } from '@/pages/TorrentSearch';
import { TorrentPlayerPage } from '@/pages/TorrentPlayerPage';
import { ProfilePage } from '@/pages/Profile';
import { MoviesPage } from '@/pages/Movies';
import { SeriesPage } from '@/pages/Series';
import { SeriesDetailsPage } from '@/pages/SeriesDetails';
import { EpisodePlayer } from '@/components/EpisodePlayer';
import { ArconteNotifier } from '@/components/ArconteNotifier';
import { ArcontePanel } from '@/components/ArcontePanel';
import { SystemStats } from '@/components/SystemStats';
import { LiveTV } from '@/pages/LiveTV';
import { AddonsPage } from '@/pages/AddonsPage';
import { AIChat } from '@/components/AIChat';
import { OrionNetwork } from '@/pages/OrionNetwork';
import { AdminDashboard } from '@/pages/AdminDashboard';

// Wrapper para Rotas Protegidas
// Wrapper para Rotas Protegidas
interface ProtectedRouteProps {
    children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, user } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
    return <>{children}</>;
};

const AppContent: React.FC = () => {
    const location = useLocation();
    const isPlayerRoute = location.pathname.startsWith('/series/episode/');

    return (
        <div className="relative min-h-screen">
            {!isPlayerRoute && <Navbar />}
            {!isPlayerRoute && <ArconteNotifier />}
            {!isPlayerRoute && <ArcontePanel />}
            <main>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Routes location={location}>
                            {/* Rotas de Autenticação */}
                            <Route path="/login" element={<AuthPage />} />
                            <Route path="/register" element={<AuthPage />} />

                            {/* Rotas Protegidas */}
                            <Route
                                path="/"
                                element={
                                    <ProtectedRoute>
                                        <HomePage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/videos/:id"
                                element={
                                    <ProtectedRoute>
                                        <VideoDetailsPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/search"
                                element={
                                    <ProtectedRoute>
                                        <SearchPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/favorites"
                                element={
                                    <ProtectedRoute>
                                        <MyList />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/torrents"
                                element={
                                    <ProtectedRoute>
                                        <TorrentSearch />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/stats"
                                element={
                                    <ProtectedRoute>
                                        <SystemStats />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/tv"
                                element={
                                    <ProtectedRoute>
                                        <LiveTV />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/torrent-player"
                                element={
                                    <ProtectedRoute>
                                        <TorrentPlayerPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/video/:magnetBase64"
                                element={
                                    <ProtectedRoute>
                                        <TorrentPlayerPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/profile"
                                element={
                                    <ProtectedRoute>
                                        <ProfilePage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/addons"
                                element={
                                    <ProtectedRoute>
                                        <AddonsPage />
                                    </ProtectedRoute>
                                }
                            />

                            <Route
                                path="/movies"
                                element={
                                    <ProtectedRoute>
                                        <MoviesPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/series"
                                element={
                                    <ProtectedRoute>
                                        <SeriesPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/series/:id"
                                element={
                                    <ProtectedRoute>
                                        <SeriesDetailsPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route
                                path="/series/episode/:episodeId"
                                element={
                                    <ProtectedRoute>
                                        <EpisodePlayer />
                                    </ProtectedRoute>
                                }
                            />

                            <Route
                                path="/orion"
                                element={
                                    <ProtectedRoute>
                                        <OrionNetwork />
                                    </ProtectedRoute>
                                }
                            />

                            {/* Rota de Admin */}
                            <Route
                                path="/admin"
                                element={
                                    <AdminRoute>
                                        <AdminPage />
                                    </AdminRoute>
                                }
                            />
                            <Route
                                path="/admin/dashboard"
                                element={
                                    <AdminRoute>
                                        <AdminDashboard />
                                    </AdminRoute>
                                }
                            />
                        </Routes>
                    </motion.div>
                </AnimatePresence>
            </main>
            {!isPlayerRoute && <Footer />}
        </div>
    );
};

export default function App() {
    return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppContent />
            <AIChat />
        </BrowserRouter>
    );
}

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { HomePage } from '@/pages/Home';
import { AuthPage } from '@/pages/Auth';
import { ArconteNotifier } from '@/components/ArconteNotifier';
import { ExperienceLoader } from '@/components/ExperienceLoader';

const VideoDetailsPage = lazy(() => import('@/pages/VideoDetails').then((module) => ({ default: module.VideoDetailsPage })));
const SearchPage = lazy(() => import('@/pages/Search').then((module) => ({ default: module.SearchPage })));
const AdminPage = lazy(() => import('@/pages/Admin').then((module) => ({ default: module.AdminPage })));
const MyList = lazy(() => import('@/pages/MyList').then((module) => ({ default: module.MyList })));
const TorrentSearch = lazy(() => import('@/pages/TorrentSearch').then((module) => ({ default: module.TorrentSearch })));
const TorrentPlayerPage = lazy(() => import('@/pages/TorrentPlayerPage').then((module) => ({ default: module.TorrentPlayerPage })));
const ProfilePage = lazy(() => import('@/pages/Profile').then((module) => ({ default: module.ProfilePage })));
const MoviesPage = lazy(() => import('@/pages/Movies').then((module) => ({ default: module.MoviesPage })));
const SeriesPage = lazy(() => import('@/pages/Series').then((module) => ({ default: module.SeriesPage })));
const SeriesDetailsPage = lazy(() => import('@/pages/SeriesDetails').then((module) => ({ default: module.SeriesDetailsPage })));
const EpisodePlayer = lazy(() => import('@/components/EpisodePlayer').then((module) => ({ default: module.EpisodePlayer })));
const ArcontePanel = lazy(() => import('@/components/ArcontePanel').then((module) => ({ default: module.ArcontePanel })));
const SystemStats = lazy(() => import('@/components/SystemStats').then((module) => ({ default: module.SystemStats })));
const LiveTV = lazy(() => import('@/pages/LiveTV').then((module) => ({ default: module.LiveTV })));
const AddonsPage = lazy(() => import('@/pages/AddonsPage').then((module) => ({ default: module.AddonsPage })));
const AIChat = lazy(() => import('@/components/AIChat').then((module) => ({ default: module.AIChat })));
const OrionNetwork = lazy(() => import('@/pages/OrionNetwork').then((module) => ({ default: module.OrionNetwork })));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));

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
    const routeLoaderVariant = location.pathname === '/'
        ? 'home'
        : location.pathname.startsWith('/search')
        ? 'search'
        : (location.pathname.startsWith('/videos/') || location.pathname.startsWith('/series/'))
            ? 'detail'
            : (location.pathname.startsWith('/movies') || location.pathname.startsWith('/favorites'))
                ? 'catalog'
                : isPlayerRoute
                    ? 'player'
                    : 'generic';
    const routeLoaderLabel = location.pathname === '/'
        ? 'Preparando experiencia inicial'
        : location.pathname.startsWith('/search')
        ? 'Preparando busca'
        : (location.pathname.startsWith('/videos/') || location.pathname.startsWith('/series/'))
            ? 'Montando detalhes'
            : (location.pathname.startsWith('/movies') || location.pathname.startsWith('/favorites'))
                ? 'Organizando catalogo'
                : isPlayerRoute
                    ? 'Inicializando player'
                    : 'Carregando modulo';

    return (
        <div className="relative min-h-screen">
            {!isPlayerRoute && <Navbar />}
            {!isPlayerRoute && <ArconteNotifier />}
            {!isPlayerRoute && (
                <Suspense fallback={null}>
                    <ArcontePanel />
                </Suspense>
            )}
            <main>
                <Suspense fallback={<ExperienceLoader label={routeLoaderLabel} variant={routeLoaderVariant} />}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            transition={{ duration: 0.3 }}
                        >
                            <Routes location={location}>
                                <Route path="/login" element={<AuthPage />} />
                                <Route path="/register" element={<AuthPage />} />

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
                </Suspense>
            </main>
            {!isPlayerRoute && <Footer />}
        </div>
    );
};

export default function App() {
    return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppContent />
            <Suspense fallback={null}>
                <AIChat />
            </Suspense>
        </BrowserRouter>
    );
}

import { Router } from 'express';
import * as AuthController from './controllers/authController';
import * as VideoController from './controllers/videoController';
import { authenticate } from './middleware/auth';
import { uploadMiddleware } from './middleware/upload';
import * as TorrentDownloader from './torrent-downloader';

const router = Router();

// Auth Routes
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);

// Video Routes
// Upload: Requer Auth + Arquivo 'file'
router.post(
  '/videos/upload',
  authenticate,
  uploadMiddleware.single('file'),
  VideoController.uploadVideo
);

// Video Routes
router.get('/videos', VideoController.listVideos);
router.get('/videos/recommended', authenticate, VideoController.getRecommended);
router.get('/videos/:id', VideoController.getVideo);
router.put('/videos/:id', VideoController.updateVideo); // Permitir update (para thumbnails do Arconte)
router.post('/videos/:id/play', authenticate, VideoController.playVideo); // Novo endpoint de Play (Materialização)

// Playback History
router.post('/videos/:id/history', authenticate, VideoController.saveHistory);
router.get('/videos/:id/history', authenticate, VideoController.getHistory);

// Torrent Download Routes
router.post('/downloads/torrent', authenticate, async (req, res) => {
  try {
    const { magnetURI, title, description, category } = req.body;
    const userId = (req as any).user.id;

    if (!magnetURI || !title) {
      return res.status(400).json({ error: 'magnetURI e title são obrigatórios' });
    }

    const result = await TorrentDownloader.downloadTorrentToServer({
      magnetURI,
      userId,
      title,
      description,
      category
    });

    res.json(result);
  } catch (error: any) {
    console.error('Erro ao iniciar download:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/downloads/:videoId', authenticate, async (req, res) => {
  try {
    const { videoId } = req.params;
    const progress = TorrentDownloader.getDownloadProgress(videoId);

    if (!progress) {
      return res.status(404).json({ error: 'Download não encontrado' });
    }

    res.json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/downloads', authenticate, async (req, res) => {
  try {
    const downloads = TorrentDownloader.listActiveDownloads();
    res.json(downloads);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/downloads/:videoId', authenticate, async (req, res) => {
  try {
    const { videoId } = req.params;
    await TorrentDownloader.cancelDownload(videoId);
    res.json({ message: 'Download cancelado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

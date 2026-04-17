/// <reference types="vitest" />
/**
 * 🧪 STREAMFORGE V2.6 - TEST SUITE
 * 
 * Testes de integração que verificam os 5 pilares do sistema:
 * 1. Queue (Enfileiramento de downloads)
 * 2. Encoding (Pipeline FFmpeg)
 * 3. Eviction (Política de limpeza de cache)
 * 4. Boost (Priorização por demanda)
 * 5. Prediction Accuracy (Feedback Loop)
 * 
 * Estes testes usam o banco real (dev.db) como exercício de integração.
 * Para produção, trocar por banco in-memory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// IDs gerados para cleanup
const testIds: string[] = [];
const TEST_USER_EMAIL = 'test-runner@streamforge.test';

beforeAll(async () => {
    // Garantir que o user de teste existe
    await prisma.user.upsert({
        where: { email: TEST_USER_EMAIL },
        create: {
            email: TEST_USER_EMAIL,
            password: 'test-hash',
            name: 'Test Runner',
            role: 'ADMIN'
        },
        update: {}
    });
});

afterAll(async () => {
    // Cleanup: remover dados de teste
    for (const id of testIds) {
        await prisma.downloadQueue.deleteMany({ where: { videoId: id } }).catch(() => { });
        await prisma.video.deleteMany({ where: { id } }).catch(() => { });
    }
    await prisma.$disconnect();
});

// ==========================================
// TEST 1: QUEUE (Enfileiramento)
// ==========================================
describe('1. Queue - Enfileiramento de Downloads', () => {
    it('deve criar um vídeo e enfileirar na DownloadQueue', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
        expect(user).toBeTruthy();

        const video = await prisma.video.create({
            data: {
                title: 'Test Video - Queue',
                description: 'Teste de enfileiramento',
                category: 'TEST',
                originalFilename: 'test.mp4',
                status: 'PROCESSING',
                userId: user!.id
            }
        });
        testIds.push(video.id);

        const queueEntry = await prisma.downloadQueue.create({
            data: {
                videoId: video.id,
                magnetURI: 'magnet:?xt=urn:btih:TESTHASH123&dn=test',
                infoHash: 'TESTHASH123',
                status: 'QUEUED',
                priority: 0
            }
        });

        expect(queueEntry.status).toBe('QUEUED');
        expect(queueEntry.videoId).toBe(video.id);
        expect(queueEntry.priority).toBe(0);
    });

    it('deve rejeitar vídeo duplicado na fila (unique constraint)', async () => {
        const videoId = testIds[0];

        await expect(
            prisma.downloadQueue.create({
                data: {
                    videoId: videoId,
                    magnetURI: 'magnet:?xt=urn:btih:DUPLICATE',
                    status: 'QUEUED',
                    priority: 0
                }
            })
        ).rejects.toThrow();
    });

    it('deve ordenar fila por prioridade (maior primeiro)', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        // Criar 3 vídeos com prioridades diferentes
        const priorities = [10, 50, 30];
        const videos = [];

        for (const prio of priorities) {
            const v = await prisma.video.create({
                data: {
                    title: `Test Priority ${prio}`,
                    category: 'TEST',
                    originalFilename: 'test.mp4',
                    status: 'PROCESSING',
                    userId: user!.id
                }
            });
            testIds.push(v.id);
            videos.push(v);

            await prisma.downloadQueue.create({
                data: {
                    videoId: v.id,
                    magnetURI: `magnet:?xt=urn:btih:PRIO${prio}`,
                    status: 'QUEUED',
                    priority: prio
                }
            });
        }

        const queue = await prisma.downloadQueue.findMany({
            where: { status: 'QUEUED', videoId: { in: videos.map(v => v.id) } },
            orderBy: { priority: 'desc' }
        });

        expect(queue[0].priority).toBe(50);
        expect(queue[1].priority).toBe(30);
        expect(queue[2].priority).toBe(10);
    });
});

// ==========================================
// TEST 2: ENCODING (Status Pipeline)
// ==========================================
describe('2. Encoding - Pipeline de Status', () => {
    it('deve transicionar status: PROCESSING → READY', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        const video = await prisma.video.create({
            data: {
                title: 'Test Video - Encoding',
                category: 'TEST',
                originalFilename: 'test.mp4',
                status: 'PROCESSING',
                userId: user!.id
            }
        });
        testIds.push(video.id);

        expect(video.status).toBe('PROCESSING');

        // Simular conclusão do encoding
        const updated = await prisma.video.update({
            where: { id: video.id },
            data: {
                status: 'READY',
                hlsPath: `/uploads/videos/${video.id}/index.m3u8`,
                duration: 120.5,
                quality: '1080p',
                fileSize: 500,
                hlsSizeMB: 450
            }
        });

        expect(updated.status).toBe('READY');
        expect(updated.hlsPath).toContain('m3u8');
        expect(updated.duration).toBe(120.5);
        expect(updated.hlsSizeMB).toBe(450);
    });

    it('deve transicionar status: PROCESSING → FAILED com erro', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        const video = await prisma.video.create({
            data: {
                title: 'Test Video - Fail',
                category: 'TEST',
                originalFilename: 'corrupt.mp4',
                status: 'PROCESSING',
                userId: user!.id
            }
        });
        testIds.push(video.id);

        const failed = await prisma.video.update({
            where: { id: video.id },
            data: { status: 'FAILED' }
        });

        expect(failed.status).toBe('FAILED');
    });
});

// ==========================================
// TEST 3: EVICTION (Política de Limpeza)
// ==========================================
describe('3. Eviction - Política de Cache', () => {
    it('deve identificar candidatos para remoção (0 views + velho)', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
        const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 dias atrás

        const video = await prisma.video.create({
            data: {
                title: 'Test Video - Eviction Candidate',
                category: 'TEST',
                originalFilename: 'old.mp4',
                status: 'READY',
                views: 0,
                lastViewedAt: null,
                createdAt: oldDate,
                userId: user!.id
            }
        });
        testIds.push(video.id);

        // Simular a query do enforceStoragePolicy
        const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const candidates = await prisma.video.findMany({
            where: {
                status: 'READY',
                id: video.id,
                OR: [
                    { views: { lt: 3 }, lastViewedAt: { lt: threshold } },
                    { lastViewedAt: null, createdAt: { lt: threshold } }
                ]
            }
        });

        expect(candidates.length).toBe(1);
        expect(candidates[0].id).toBe(video.id);
    });

    it('NÃO deve remover vídeo popular (muitas views)', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
        const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

        const video = await prisma.video.create({
            data: {
                title: 'Test Video - Popular',
                category: 'TEST',
                originalFilename: 'popular.mp4',
                status: 'READY',
                views: 100,
                lastViewedAt: new Date(),
                createdAt: oldDate,
                userId: user!.id
            }
        });
        testIds.push(video.id);

        const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const candidates = await prisma.video.findMany({
            where: {
                status: 'READY',
                id: video.id,
                OR: [
                    { views: { lt: 3 }, lastViewedAt: { lt: threshold } },
                    { lastViewedAt: null, createdAt: { lt: threshold } }
                ]
            }
        });

        expect(candidates.length).toBe(0);
    });
});

// ==========================================
// TEST 4: BOOST (Priorização por Demanda)
// ==========================================
describe('4. Boost - Priorização por Demanda', () => {
    it('deve incrementar prioridade via boost', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        const video = await prisma.video.create({
            data: {
                title: 'Test Video - Boost',
                category: 'TEST',
                originalFilename: 'boost.mp4',
                status: 'PROCESSING',
                userId: user!.id
            }
        });
        testIds.push(video.id);

        const queueEntry = await prisma.downloadQueue.create({
            data: {
                videoId: video.id,
                magnetURI: 'magnet:?xt=urn:btih:BOOSTHASH',
                status: 'DOWNLOADING',
                priority: 10
            }
        });

        // Simular boost de demanda (+50)
        const boosted = await prisma.downloadQueue.update({
            where: { id: queueEntry.id },
            data: { priority: { increment: 50 } }
        });

        expect(boosted.priority).toBe(60);
    });

    it('deve manter boost cumulativo (múltiplos plays)', async () => {
        const lastVideo = testIds[testIds.length - 1];
        const entry = await prisma.downloadQueue.findUnique({ where: { videoId: lastVideo } });

        // Segundo boost
        const boosted = await prisma.downloadQueue.update({
            where: { id: entry!.id },
            data: { priority: { increment: 50 } }
        });

        expect(boosted.priority).toBe(110); // 60 + 50
    });
});

// ==========================================
// TEST 5: PREDICTION ACCURACY (Feedback Loop)
// ==========================================
describe('5. Prediction Accuracy - Feedback Loop', () => {
    it('deve marcar vídeo como isPredictive', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        const video = await prisma.video.create({
            data: {
                title: 'Test Predictive Hit',
                category: 'TEST',
                originalFilename: 'predicted.mp4',
                status: 'READY',
                isPredictive: true,
                views: 5,
                userId: user!.id
            }
        });
        testIds.push(video.id);

        expect(video.isPredictive).toBe(true);
        expect(video.views).toBe(5);
    });

    it('deve calcular accuracy corretamente (hits vs misses)', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        // Criar 2 misses (predictive mas 0 views)
        for (let i = 0; i < 2; i++) {
            const v = await prisma.video.create({
                data: {
                    title: `Test Predictive Miss ${i}`,
                    category: 'TEST',
                    originalFilename: 'miss.mp4',
                    status: 'READY',
                    isPredictive: true,
                    views: 0,
                    userId: user!.id
                }
            });
            testIds.push(v.id);
        }

        // Contar todos os preditivos de teste
        const allPredictive = await prisma.video.findMany({
            where: { isPredictive: true, category: 'TEST' },
            select: { views: true }
        });

        const total = allPredictive.length;
        const hits = allPredictive.filter(v => v.views > 0).length;
        const accuracy = (hits / total) * 100;

        // Temos 1 hit (5 views) e 2 misses (0 views) = 33.3%
        expect(total).toBe(3);
        expect(hits).toBe(1);
        expect(accuracy).toBeCloseTo(33.33, 0);
    });

    it('deve diferenciar preditivos de orgânicos', async () => {
        const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });

        // Criar vídeo orgânico (não preditivo)
        const organic = await prisma.video.create({
            data: {
                title: 'Test Organic',
                category: 'TEST',
                originalFilename: 'organic.mp4',
                status: 'READY',
                isPredictive: false,
                views: 50,
                userId: user!.id
            }
        });
        testIds.push(organic.id);

        // Contar preditivos de teste (não deve incluir o orgânico)
        const predictiveOnly = await prisma.video.findMany({
            where: { isPredictive: true, category: 'TEST' }
        });

        const organicInPredictive = predictiveOnly.find(v => v.id === organic.id);
        expect(organicInPredictive).toBeUndefined();
    });
});

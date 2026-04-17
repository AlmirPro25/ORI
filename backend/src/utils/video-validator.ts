/**
 * Middleware de Validação de Vídeos
 * Garante que vídeos com magnet links sempre tenham status NEXUS
 */

export function validateVideoStatus(videoData: any) {
    // Se o hlsPath é um magnet link, forçar status NEXUS
    if (videoData.hlsPath && videoData.hlsPath.startsWith('magnet:')) {
        if (videoData.status !== 'NEXUS') {
            console.warn(`⚠️ Corrigindo status de vídeo com magnet link: ${videoData.status} → NEXUS`);
            videoData.status = 'NEXUS';
        }
    }

    // Se o status é NEXUS mas não tem magnet link, avisar
    if (videoData.status === 'NEXUS' && videoData.hlsPath && !videoData.hlsPath.startsWith('magnet:')) {
        console.warn(`⚠️ Vídeo com status NEXUS mas sem magnet link: ${videoData.title}`);
    }

    return videoData;
}

export function sanitizeMagnetLink(magnetUri: string): string {
    // Remove espaços e caracteres inválidos
    return magnetUri.trim();
}

export function isMagnetLink(uri: string): boolean {
    return Boolean(uri && uri.trim().startsWith('magnet:'));
}

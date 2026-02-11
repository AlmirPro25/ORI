// @ts-nocheck
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import path from 'path';
import semver from 'semver'; // Adicione se necessário, ou remova se não usar
import env from '../config/env';

// Configuração do Cliente S3 (Compatível com AWS S3, MinIO, Cloudflare R2)
export const s3Client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true, // Necessário para MinIO
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

/**
 * Upload de um arquivo único para o S3
 */
export const uploadFileToS3 = async (filePath: string, key: string, contentType: string) => {
  const fileStream = fs.createReadStream(filePath);

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: env.S3_BUCKET_NAME,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
    },
  });

  await upload.done();
  return key;
};

/**
 * Upload de um diretório inteiro de forma recursiva (usado para HLS multi-bitrate)
 */
export const uploadDirectoryToS3 = async (dirPath: string, s3Prefix: string) => {
  const items = fs.readdirSync(dirPath); // Lê arquivos e pastas

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Se for diretório, chama recursivamente
      await uploadDirectoryToS3(fullPath, `${s3Prefix}/${item}`);
    } else {
      // Se for arquivo, faz upload
      const s3Key = `${s3Prefix}/${item}`;

      // Define Content-Type correto
      let contentType = 'application/octet-stream';
      if (item.endsWith('.m3u8')) contentType = 'application/x-mpegURL';
      if (item.endsWith('.ts')) contentType = 'video/MP2T';

      await uploadFileToS3(fullPath, s3Key, contentType);
    }
  }
};

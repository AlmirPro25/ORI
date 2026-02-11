
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(10),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  // Configuração S3 / MinIO
  S3_ENDPOINT: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_BUCKET_NAME: z.string().default('streamforge-media'),
});

const env = envSchema.parse(process.env);

export default env;

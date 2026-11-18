import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env, storageEnabled } from '../env.js';

const dataDir = resolve(process.cwd(), '.storage');

type S3Client = import('@aws-sdk/client-s3').S3Client;

let cached: S3Client | null = null;

async function s3(): Promise<S3Client> {
  if (!cached) {
    const { S3Client: Client } = await import('@aws-sdk/client-s3');
    cached = new Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY ?? '',
        secretAccessKey: env.S3_SECRET_KEY ?? '',
      },
    });
  }
  return cached;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (storageEnabled) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const path = join(dataDir, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (storageEnabled) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3();
    const result = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? new Uint8Array());
  }
  return readFile(join(dataDir, key));
}

export async function deleteObject(key: string) {
  if (storageEnabled) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await s3();
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return;
  }
  await unlink(join(dataDir, key)).catch(() => undefined);
}

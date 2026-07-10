import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'collabspace',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'collabspace123',
  },
  // MinIO needs path-style URLs (bucket.endpoint/key resolves via DNS on
  // real S3 but not against a local MinIO container).
  forcePathStyle: true,
});

export const BUCKET = process.env.S3_BUCKET ?? 'collabspace-files';
const UPLOAD_URL_TTL_SECONDS = 60 * 10;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 10;

export function buildStorageKey(workspaceId: string, fileId: string, versionNumber: number): string {
  return `workspaces/${workspaceId}/files/${fileId}/v${versionNumber}`;
}

export function presignUpload(storageKey: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: storageKey, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export function presignDownload(storageKey: string, downloadName: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadName)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

export function deleteObject(storageKey: string) {
  return s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey }));
}

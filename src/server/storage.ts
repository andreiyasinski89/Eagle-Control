import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "@/server/http/errors";
import { env } from "@/lib/env";

function client(): { s3: S3Client; bucket: string } {
  const e = env();
  if (!e.S3_ENDPOINT || !e.S3_ACCESS_KEY || !e.S3_SECRET_KEY) {
    throw new ApiError(503, "storage_unconfigured", "File storage is not configured");
  }
  return {
    bucket: e.S3_BUCKET,
    s3: new S3Client({
      region: "auto",
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: true, // MinIO and R2 both accept path-style
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
    }),
  };
}

/** `size` is signed into the URL: S3 refuses an upload whose length differs, so the 25 MB limit holds for the bytes, not just the claim. */
export async function presignUpload(key: string, contentType: string, size?: number, expiresIn = 300): Promise<string> {
  const { s3, bucket } = client();
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ...(size ? { ContentLength: size } : {}) }), { expiresIn });
}

export async function presignDownload(key: string, fileName: string, expiresIn = 300): Promise<string> {
  const { s3, bucket } = client();
  const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn },
  );
}

export async function deleteObject(key: string): Promise<void> {
  const { s3, bucket } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

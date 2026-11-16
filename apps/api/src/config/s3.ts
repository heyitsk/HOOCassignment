import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "ap-south-1",
});

export const S3_BUCKET = process.env.S3_BUCKET_NAME!;

if (!S3_BUCKET) {
  throw new Error("S3_BUCKET_NAME env var is required");
}

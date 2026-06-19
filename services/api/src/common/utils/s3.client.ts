import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Storage {
  private readonly logger = new Logger(S3Storage.name);
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: this.config.get<string>('S3_ENDPOINT'),
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE', 'true') !== 'false',
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? '',
      },
    });
  }

  bucketEvidence(): string {
    return this.config.get<string>('S3_BUCKET_EVIDENCE') ?? this.config.get<string>('S3_BUCKET') ?? 'theesg-evidence';
  }
  bucketReports(): string {
    return this.config.get<string>('S3_BUCKET_REPORTS') ?? this.config.get<string>('S3_BUCKET') ?? 'theesg-reports';
  }

  async put(args: {
    bucket: string;
    key: string;
    body: Buffer | NodeJS.ReadableStream;
    contentType?: string;
    metadata?: Record<string, string>;
  }): Promise<{ bucket: string; key: string; etag?: string }> {
    const res = await this.client.send(
      new PutObjectCommand({
        Bucket: args.bucket,
        Key: args.key,
        Body: args.body as Buffer,
        ContentType: args.contentType,
        Metadata: args.metadata,
      }),
    );
    return { bucket: args.bucket, key: args.key, etag: res.ETag };
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const c of res.Body as AsyncIterable<Buffer>) chunks.push(Buffer.from(c));
    return Buffer.concat(chunks);
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  /**
   * Generates a presigned GET URL. When `downloadFilename` is supplied we set
   * `ResponseContentDisposition: attachment; filename="…"` so the browser
   * downloads rather than renders inline (defence against stored XSS in
   * uploaded HTML/SVG and similar content-sniffing tricks).
   */
  async presignGet(
    bucket: string,
    key: string,
    ttlSeconds = 900,
    downloadFilename?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(downloadFilename
          ? {
              ResponseContentDisposition: `attachment; filename="${downloadFilename.replace(/"/g, '')}"`,
            }
          : {}),
      }),
      { expiresIn: ttlSeconds },
    );
  }

  async presignPut(bucket: string, key: string, ttlSeconds = 900, contentType?: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: ttlSeconds },
    );
  }

  async health(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucketEvidence() }));
      return true;
    } catch (e) {
      this.logger.warn(`S3 health failed: ${(e as Error).message}`);
      return false;
    }
  }
}

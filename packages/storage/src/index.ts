import { TosClient } from "@volcengine/tos-sdk";
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export interface StorageObjectMetadata {
  sizeBytes: number;
  etag?: string;
  contentType?: string;
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface DownloadOptions { fileName?: string; contentType?: string }

export interface ObjectStorage {
  readonly bucket: string;
  createUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<PresignedUpload>;
  createDownloadUrl(key: string, expiresInSeconds?: number, options?: DownloadOptions): Promise<string>;
  headObject(key: string): Promise<StorageObjectMetadata>;
  deleteObject(key: string): Promise<void>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
}

export interface TosStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
}

export class TosObjectStorage implements ObjectStorage {
  readonly bucket: string;
  private readonly client: TosClient;

  constructor(config: TosStorageConfig) {
    this.bucket = config.bucket;
    this.client = new TosClient({
      endpoint: config.endpoint,
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
    });
  }

  async createUploadUrl(key: string, _contentType: string, expiresInSeconds = 15 * 60): Promise<PresignedUpload> {
    const url = this.client.getPreSignedUrl({
      method: "PUT",
      bucket: this.bucket,
      key,
      expires: expiresInSeconds,
    });
    return {
      url,
      method: "PUT",
      headers: {},
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async createDownloadUrl(key: string, expiresInSeconds = 10 * 60, _options?: DownloadOptions): Promise<string> {
    return this.client.getPreSignedUrl({
      method: "GET",
      bucket: this.bucket,
      key,
      expires: expiresInSeconds,
    });
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    const result = await this.client.headObject({ bucket: this.bucket, key });
    const rawLength = result.data["content-length"];
    return {
      sizeBytes: Number(rawLength),
      etag: result.data.etag,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.deleteObject({ bucket: this.bucket, key });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.putObject({ bucket: this.bucket, key, body, contentType });
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.getObject({ bucket: this.bucket, key });
    const data = result.data as unknown;
    if (data instanceof Buffer) return data;
    const transformer = (data as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray;
    if (typeof transformer === "function") return Buffer.from(await transformer.call(data));
    if (data && Symbol.asyncIterator in (data as object)) {
      const chunks: Buffer[] = [];
      for await (const chunk of data as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }
    throw new Error("无法读取对象存储响应体");
  }
}

type LocalTokenPayload = { action: "upload" | "download"; key: string; expiresAt: number; fileName?: string; contentType?: string };

/** 本地磁盘私有存储：文件写入工作区 .local-storage 目录，上传/下载通过 HMAC 签名 token 走 API 代理。 */
export class LocalFileObjectStorage implements ObjectStorage {
  readonly bucket = "local-private-assets";
  private readonly root: string;
  private readonly signingSecret: string;

  constructor(signingSecret: string, root?: string) {
    this.signingSecret = signingSecret;
    this.root = root ?? resolve(findWorkspaceRoot(), ".local-storage");
  }

  async createUploadUrl(key: string, _contentType: string, expiresInSeconds = 15 * 60) {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return { url: `/api/v1/local-storage/upload/${this.sign({ action: "upload", key, expiresAt })}`, method: "PUT" as const, headers: {}, expiresAt: new Date(expiresAt) };
  }

  async createDownloadUrl(key: string, expiresInSeconds = 10 * 60, options?: DownloadOptions): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return `/api/v1/local-storage/download/${this.sign({ action: "download", key, expiresAt, ...(options?.fileName ? { fileName: options.fileName } : {}), ...(options?.contentType ? { contentType: options.contentType } : {}) })}`;
  }

  async headObject(key: string) {
    const info = await stat(this.pathFor(key));
    return { sizeBytes: info.size };
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async saveUpload(token: string, data: Buffer): Promise<void> {
    const payload = this.verify(token, "upload");
    const path = this.pathFor(payload.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: "wx" });
  }

  async readDownload(token: string): Promise<Buffer> {
    const payload = this.verify(token, "download");
    return readFile(this.pathFor(payload.key));
  }

  async readDownloadWithMetadata(token: string): Promise<{ data: Buffer; fileName: string; contentType: string }> {
    const payload = this.verify(token, "download");
    return { data: await readFile(this.pathFor(payload.key)), fileName: payload.fileName ?? "download", contentType: payload.contentType ?? "application/octet-stream" };
  }

  private pathFor(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error("Invalid storage key");
    return path;
  }

  private sign(payload: LocalTokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.signingSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify(token: string, action: LocalTokenPayload["action"]): LocalTokenPayload {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) throw new Error("Invalid storage token");
    const expected = createHmac("sha256", this.signingSecret).update(encoded).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("Invalid storage token");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as LocalTokenPayload;
    if (payload.action !== action || payload.expiresAt < Date.now()) throw new Error("Expired storage token");
    return payload;
  }
}

function findWorkspaceRoot(): string {
  let current = process.cwd();
  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("无法定位项目根目录");
    current = parent;
  }
}

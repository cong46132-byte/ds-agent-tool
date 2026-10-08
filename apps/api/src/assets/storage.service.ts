import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { LocalFileObjectStorage, TosObjectStorage, type ObjectStorage } from "@ds/storage";
import { parseApiEnv } from "../runtime-env.js";

@Injectable()
export class StorageService {
  private readonly storage: ObjectStorage;

  constructor() {
    const env = parseApiEnv(process.env);
    if (env.STORAGE_DRIVER === "local") {
      this.storage = new LocalFileObjectStorage(env.LOCAL_STORAGE_SIGNING_SECRET);
      return;
    }
    this.storage = env.TOS_BUCKET && env.TOS_ACCESS_KEY && env.TOS_SECRET_KEY
      ? new TosObjectStorage({
          endpoint: env.TOS_ENDPOINT,
          region: env.TOS_REGION,
          bucket: env.TOS_BUCKET,
          accessKeyId: env.TOS_ACCESS_KEY,
          accessKeySecret: env.TOS_SECRET_KEY,
        })
      : new UnconfiguredObjectStorage();
  }

  get(): ObjectStorage {
    return this.storage;
  }

  async saveLocalUpload(token: string, data: Buffer): Promise<void> {
    if (!(this.storage instanceof LocalFileObjectStorage)) this.localOnly();
    await this.storage.saveUpload(token, data);
  }

  async readLocalDownload(token: string): Promise<{ data: Buffer; fileName: string; contentType: string }> {
    if (!(this.storage instanceof LocalFileObjectStorage)) this.localOnly();
    return this.storage.readDownloadWithMetadata(token);
  }

  private localOnly(): never {
    throw new ServiceUnavailableException({ code: "LOCAL_STORAGE_DISABLED", message: "本地存储未启用" });
  }
}

class UnconfiguredObjectStorage implements ObjectStorage {
  readonly bucket = "unconfigured";
  private unavailable(): never {
    throw new ServiceUnavailableException({ code: "STORAGE_NOT_CONFIGURED", message: "TOS 对象存储尚未配置" });
  }
  createUploadUrl(): Promise<never> { return Promise.reject(this.unavailable()); }
  createDownloadUrl(): Promise<never> { return Promise.reject(this.unavailable()); }
  headObject(): Promise<never> { return Promise.reject(this.unavailable()); }
  deleteObject(): Promise<never> { return Promise.reject(this.unavailable()); }
  putObject(): Promise<never> { return Promise.reject(this.unavailable()); }
  getObject(): Promise<never> { return Promise.reject(this.unavailable()); }
}

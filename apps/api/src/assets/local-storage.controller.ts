import { BadRequestException, Controller, Get, Inject, Param, Put, Req, Res } from "@nestjs/common";
import { StorageService } from "./storage.service.js";

type StreamRequest = AsyncIterable<Uint8Array>;
type BinaryResponse = {
  setHeader(name: string, value: string): void;
  send(data: Buffer): void;
  status(code: number): BinaryResponse;
};

const MAX_FILE_SIZE = 500 * 1024 * 1024;

@Controller("local-storage")
export class LocalStorageController {
  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  @Put("upload/:token")
  async upload(@Param("token") token: string, @Req() request: StreamRequest, @Res() response: BinaryResponse) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_FILE_SIZE) throw new BadRequestException({ code: "FILE_TOO_LARGE", message: "单文件不能超过 500MB" });
      chunks.push(buffer);
    }
    await this.storageService.saveLocalUpload(token, Buffer.concat(chunks));
    response.status(204).send(Buffer.alloc(0));
  }

  @Get("download/:token")
  async download(@Param("token") token: string, @Res() response: BinaryResponse) {
    const { data, fileName, contentType } = await this.storageService.readLocalDownload(token);
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader("Content-Length", String(data.length));
    response.send(data);
  }
}

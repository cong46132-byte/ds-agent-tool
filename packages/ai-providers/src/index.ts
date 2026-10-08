import type { GenerationCapability, GenerationParameters } from "@ds/contracts";
import sharp from "sharp";

export interface GeneratedFile { name: string; contentType: string; data: Buffer; width: number; height: number; durationMs?: number }
export interface GenerationAsset { id: string; name: string; contentType: string; data: Buffer }
export interface GenerationRequestInput { taskId: string; capability: GenerationCapability; model: string; prompt: string; parameters: GenerationParameters; assets: GenerationAsset[] }
export type ProgressReporter = (percent: number) => void | Promise<void>;
export interface ModelProvider { readonly id: string; generate(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> }

export async function applyImageComplianceMarkings(file: GeneratedFile, platformWatermark: boolean): Promise<GeneratedFile> {
  if (!file.contentType.startsWith("image/")) return file;
  const width = Math.max(1, file.width);
  const height = Math.max(1, file.height);
  const fontSize = Math.max(13, Math.round(width * 0.015));
  const label = platformWatermark ? "XINGGOU  |  AI GENERATED" : "AI GENERATED";
  const repeated = platformWatermark
    ? Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => `<text x="${Math.round(width * (0.18 + column * 0.32))}" y="${Math.round(height * (0.2 + row * 0.3))}" transform="rotate(-24 ${Math.round(width * (0.18 + column * 0.32))} ${Math.round(height * (0.2 + row * 0.3))})" text-anchor="middle">XINGGOU</text>`).join("")).join("")
    : "";
  const labelWidth = platformWatermark ? Math.round(width * 0.25) : Math.round(width * 0.18);
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>.repeat{font:600 ${Math.max(18, Math.round(width * 0.03))}px sans-serif;fill:white;fill-opacity:.16;letter-spacing:3px}.label{font:600 ${fontSize}px sans-serif;fill:white;letter-spacing:1px}</style><g class="repeat">${repeated}</g><rect x="${width - labelWidth - Math.round(width * 0.018)}" y="${height - fontSize * 2.25}" width="${labelWidth}" height="${fontSize * 1.7}" rx="${Math.round(fontSize * 0.4)}" fill="black" fill-opacity=".52"/><text class="label" x="${Math.round(width * 0.965)}" y="${height - fontSize * 1.08}" text-anchor="end">${label}</text></svg>`);
  const pipeline = sharp(file.data).composite([{ input: overlay, top: 0, left: 0 }]);
  const data = file.contentType === "image/jpeg" ? await pipeline.jpeg({ quality: 92 }).toBuffer() : await pipeline.png({ compressionLevel: 9 }).toBuffer();
  return { ...file, data };
}

/** 为免费用户生成平台水印副本。母版应已包含不可关闭的 AI 生成标识。 */
export async function applyPlatformWatermark(file: GeneratedFile): Promise<GeneratedFile> {
  if (!file.contentType.startsWith("image/")) return file;
  const metadata = await sharp(file.data).metadata();
  const width = Math.max(1, file.width || metadata.width || 1);
  const height = Math.max(1, file.height || metadata.height || 1);
  const repeatSize = Math.max(18, Math.round(width * 0.03));
  const repeated = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) => {
      const x = Math.round(width * (0.18 + column * 0.32));
      const y = Math.round(height * (0.2 + row * 0.3));
      return `<text x="${x}" y="${y}" transform="rotate(-24 ${x} ${y})" text-anchor="middle">XINGGOU</text>`;
    }).join(""),
  ).join("");
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>.repeat{font:600 ${repeatSize}px sans-serif;fill:white;fill-opacity:.16;letter-spacing:3px}</style><g class="repeat">${repeated}</g></svg>`);
  const pipeline = sharp(file.data).composite([{ input: overlay, top: 0, left: 0 }]);
  const data = file.contentType === "image/jpeg"
    ? await pipeline.jpeg({ quality: 92 }).toBuffer()
    : await pipeline.png({ compressionLevel: 9 }).toBuffer();
  return { ...file, data, width, height };
}

export class ProviderNotConfiguredError extends Error {
  readonly code = "PROVIDER_NOT_CONFIGURED";
  constructor(model: string) { super(`模型 ${model} 尚未配置真实供应商凭据`); }
}

export class ProviderRequestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

class UnconfiguredProvider implements ModelProvider {
  readonly id = "unconfigured";
  async generate(input: GenerationRequestInput): Promise<GeneratedFile[]> { throw new ProviderNotConfiguredError(input.model); }
}

class LocalImageToolsProvider implements ModelProvider {
  readonly id = "local-image-tools";

  async generate(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    if (input.capability !== "product_white_background") return new UnconfiguredProvider().generate(input);
    const source = input.assets[0];
    if (!source || !source.contentType.startsWith("image/")) throw Object.assign(new Error("请上传一张商品图片"), { code: "SOURCE_IMAGE_REQUIRED" });
    await onProgress(25);
    const size = input.parameters.resolution === "2K" ? 2048 : 1024;
    const format = input.parameters.format === "JPG" ? "jpg" : "png";
    const pipeline = sharp(source.data, { failOn: "error" }).rotate().flatten({ background: "#ffffff" }).resize(size, size, {
      fit: "contain", background: "#ffffff", withoutEnlargement: false,
    });
    const data = format === "jpg" ? await pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer() : await pipeline.png({ compressionLevel: 9 }).toBuffer();
    await onProgress(90);
    return [{ name: `white-background-${input.taskId}.${format}`, contentType: `image/${format === "jpg" ? "jpeg" : "png"}`, data, width: size, height: size }];
  }
}

type ArkImageResponse = {
  data?: Array<{ b64_json?: string; size?: string; output_format?: string; error?: { code?: string; message?: string } }>;
  error?: { code?: string; message?: string };
};

type ProductDetailPlan = { type: string; instruction: string; referenceIndexes: number[] };

function parseProductDetailPlan(prompt: string, count: number): { brief: string; items: ProductDetailPlan[] } {
  const marker = "\n套图方案JSON：";
  const markerIndex = prompt.lastIndexOf(marker);
  const brief = markerIndex >= 0 ? prompt.slice(0, markerIndex) : prompt;
  const defaults = [
    { type: "主图", instruction: "纯净棚拍或高级渐变背景，商品作为唯一视觉主体，正面完整展示；不得出现使用场景和复杂道具" },
    { type: "卖点图", instruction: "棚拍信息图构图，使用局部放大、细节特写或简洁视觉符号突出一个核心卖点；不得使用产地或生活场景" },
    { type: "场景图", instruction: "将商品自然置于目标人群的真实使用或产地场景，体现环境氛围和使用关系；不得复用主图棚拍构图" },
    { type: "功能展示图", instruction: "微距或剖面式专业产品摄影，突出材质、结构、工艺或功能细节；不得使用与场景图相同的远景背景" },
    { type: "品牌氛围图", instruction: "使用更克制的品牌色、留白和生活方式陈列形成收束视觉；不得重复前面图片的主体角度和背景" },
  ];
  if (markerIndex < 0) return { brief, items: defaults.slice(0, count).map((item) => ({ ...item, referenceIndexes: [] })) };
  try {
    const parsed = JSON.parse(prompt.slice(markerIndex + marker.length)) as unknown;
    if (!Array.isArray(parsed)) throw new Error("invalid plan");
    const items = parsed.slice(0, count).map((item, index) => {
      const value = item as { type?: unknown; instruction?: unknown; referenceIndexes?: unknown };
      const requestedType = typeof value.type === "string" ? value.type.slice(0, 30) : "";
      const fallback = defaults.find((candidate) => candidate.type === requestedType) ?? defaults[index] ?? defaults[0]!;
      return {
        type: requestedType || fallback.type,
        instruction: typeof value.instruction === "string" && value.instruction.trim() ? value.instruction.slice(0, 300) : fallback.instruction,
        referenceIndexes: Array.isArray(value.referenceIndexes) ? value.referenceIndexes.filter((entry): entry is number => Number.isInteger(entry) && entry >= 0 && entry < 5) : [],
      };
    });
    return { brief, items: items.length ? items : defaults.slice(0, count).map((item) => ({ ...item, referenceIndexes: [] })) };
  } catch {
    return { brief, items: defaults.slice(0, count).map((item) => ({ ...item, referenceIndexes: [] })) };
  }
}

class VolcengineArkProvider implements ModelProvider {
  readonly id = "volcengine-ark";
  constructor(private readonly apiKey: string, private readonly imageModel: string) {}

  async generate(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    if (input.capability === "director_video" || input.capability === "video_recreation") return this.generateVideo(input, onProgress);
    if (input.capability === "product_detail_set") return this.generateProductDetailSet(input, onProgress);
    if (input.capability === "image_retouche") return this.generateImageRetouche(input, onProgress);
    if (input.capability === "virtual_try_on") return this.generateVirtualTryOn(input, onProgress);
    if (input.capability === "product_use") return this.generateProductUse(input, onProgress);
    if (input.capability === "clothing_redesign") return this.generateClothingRedesign(input, onProgress);
    if (input.capability === "face_three_view") return this.generateFaceThreeView(input, onProgress);
    if (input.capability === "person_four_view") return this.generatePersonFourView(input, onProgress);
    if (input.capability === "model_face_swap") return this.generateModelFaceSwap(input, onProgress);
    if (input.capability === "face_fusion") return this.generateFaceFusion(input, onProgress);
    if (input.capability === "person_in_scene") return this.generatePersonInScene(input, onProgress);
    if (input.capability === "person_realism") return this.generatePersonRealism(input, onProgress);
    if (input.capability !== "product_white_background") return new UnconfiguredProvider().generate(input);
    const source = input.assets[0];
    if (!source || !source.contentType.startsWith("image/")) throw new ProviderRequestError("SOURCE_IMAGE_REQUIRED", "请上传一张商品图片");
    await onProgress(15);
    const file = await this.generateImage(input, [source], [
      "保留原商品的外形、颜色、材质、文字、商标和所有细节，仅移除原背景。",
      "将商品精确抠图并放在 #FFFFFF 纯白背景中央，商品完整可见，四周留出均匀边距，不添加道具、文字、阴影或装饰。",
      input.prompt,
    ].filter(Boolean).join("\n"), `seedream-white-background-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateVideo(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const duration = Number.parseInt(input.parameters.duration ?? "5s", 10);
    if (!Number.isFinite(duration)) throw new ProviderRequestError("INVALID_VIDEO_DURATION", "视频时长参数无效");
    const totalAssetBytes = input.assets.reduce((total, asset) => total + asset.data.length, 0);
    if (totalAssetBytes > 45 * 1024 * 1024) throw new ProviderRequestError("VIDEO_INPUT_TOO_LARGE", "参考素材总大小不能超过 45MB，请压缩后重试");
    const content: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt.trim() || "生成一条自然、流畅、画面稳定的商业视频" }];
    for (const asset of input.assets) {
      const url = `data:${asset.contentType};base64,${asset.data.toString("base64")}`;
      if (asset.contentType.startsWith("image/")) content.push({ type: "image_url", image_url: { url } });
      else if (asset.contentType.startsWith("audio/")) content.push({ type: "audio_url", audio_url: { url } });
      else if (asset.contentType.startsWith("video/")) content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    }
    await onProgress(5);
    const createBody: Record<string, unknown> = {
      model: input.model,
      content,
      resolution: input.parameters.resolution,
      ratio: input.parameters.ratio,
      duration,
      watermark: false,
      output_format: "mp4",
    };
    if (input.model.startsWith("doubao-seedance-2-5")) createBody.generate_audio = true;
    const created = await this.arkRequest<ArkVideoCreateResponse>("/contents/generations/tasks", { method: "POST", body: JSON.stringify(createBody) });
    if (!created.id) throw new ProviderRequestError("PROVIDER_EMPTY_TASK_ID", "火山方舟未返回视频任务 ID");
    await onProgress(10);
    const deadline = Date.now() + 35 * 60_000;
    let result: ArkVideoTaskResponse | undefined;
    let pollCount = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      result = await this.arkRequest<ArkVideoTaskResponse>(`/contents/generations/tasks/${encodeURIComponent(created.id)}`);
      pollCount += 1;
      if (result.status === "succeeded") break;
      if (result.status === "failed" || result.status === "cancelled" || result.status === "expired") {
        throw new ProviderRequestError(result.error?.code ?? "PROVIDER_VIDEO_FAILED", result.error?.message ?? `视频生成失败（${result.status}）`);
      }
      await onProgress(Math.min(92, 10 + pollCount * 2));
    }
    if (result?.status !== "succeeded") throw new ProviderRequestError("PROVIDER_TIMEOUT", "视频生成超过 35 分钟，请稍后重试");
    const videoUrl = result.content?.video_url;
    if (!videoUrl) throw new ProviderRequestError("PROVIDER_EMPTY_OUTPUT", "火山方舟未返回视频下载地址");
    await onProgress(94);
    const videoResponse = await fetchWithTimeout(videoUrl, {}, 120_000);
    if (!videoResponse.ok) throw new ProviderRequestError(`PROVIDER_DOWNLOAD_${videoResponse.status}`, `视频结果下载失败（${videoResponse.status}）`);
    const data = Buffer.from(await videoResponse.arrayBuffer());
    if (!data.length) throw new ProviderRequestError("PROVIDER_EMPTY_OUTPUT", "下载到的视频文件为空");
    const dimensions = videoDimensions(input.parameters.resolution, input.parameters.ratio);
    await onProgress(98);
    return [{ name: `seedance-${input.taskId}.mp4`, contentType: "video/mp4", data, ...dimensions, durationMs: duration * 1000 }];
  }

  private async arkRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetchWithTimeout(`https://ark.cn-beijing.volces.com/api/v3${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    }, 120_000);
    const body = await response.json().catch(() => ({})) as T & { error?: { code?: string; message?: string } };
    if (!response.ok || body.error) throw new ProviderRequestError(body.error?.code ?? `PROVIDER_HTTP_${response.status}`, body.error?.message ?? `火山方舟请求失败（${response.status}）`);
    return body;
  }

  private async generateImageRetouche(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const source = input.assets[0];
    if (!source || !source.contentType.startsWith("image/")) throw new ProviderRequestError("SOURCE_IMAGE_REQUIRED", "请上传一张待精修图片");
    await onProgress(15);
    const prompt = [
      "你是一名专业商业修图师。只对参考图片做克制、真实的精修，不重新设计或替换主体。",
      "必须保留原图主体身份、构图、商品结构、颜色、材质、包装文字、商标与关键细节；不得添加新商品、文字、水印、边框或无关元素。",
      "输出应自然可信，避免过度磨皮、锐化光晕、塑料质感、错误文字和细节幻觉。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [source], prompt, `seedream-retouche-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateVirtualTryOn(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const [modelImage, upperGarment, lowerGarment] = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 3);
    if (!modelImage || !upperGarment) throw new ProviderRequestError("TRY_ON_IMAGES_REQUIRED", "请上传模特图和服装图");
    await onProgress(15);
    const prompt = [
      "参考图顺序：第一张是模特人物，第二张是需要换上的主要服装，第三张如存在则是下装。",
      "生成真实自然的电商服装上身效果。严格保留第一张图中人物的脸部身份、发型、体型、姿势、肢体结构、背景、镜头与光线。",
      "准确还原服装参考图的版型、颜色、面料纹理、领口、袖型、图案、Logo 与装饰细节，让衣物自然贴合身体，并呈现合理褶皱和遮挡关系。",
      "只替换服装，不改变人物五官、肤色、身体比例和环境；不得添加文字、水印、配饰或无关物体，不得产生多余肢体和错误手指。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const references = lowerGarment ? [modelImage, upperGarment, lowerGarment] : [modelImage, upperGarment];
    const file = await this.generateImage(input, references, prompt, `seedream-try-on-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateProductUse(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const [personImage, productImage] = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 2);
    if (!personImage || !productImage) throw new ProviderRequestError("PRODUCT_USE_IMAGES_REQUIRED", "请上传人物参考图和产品图");
    await onProgress(15);
    const prompt = [
      "参考图顺序：第一张是人物参考，第二张是需要展示和使用的商品。",
      "生成真实自然的电商商品使用场景图。严格保留人物的脸部身份、发型、体型与肤色，同时准确还原商品的外形、比例、颜色、材质、包装文字、商标和细节。",
      "让人物以符合商品实际用途的动作自然拿取、佩戴或使用商品，手部接触、尺寸比例、透视、遮挡、光线和阴影必须合理。",
      "不得改变商品结构，不得生成错误文字、额外商品、多余肢体、水印或无关品牌。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [personImage, productImage], prompt, `seedream-product-use-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateClothingRedesign(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const [garmentImage, fabricImage, printImage] = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 3);
    if (!garmentImage) throw new ProviderRequestError("GARMENT_IMAGE_REQUIRED", "请上传一张待改款服装图");
    await onProgress(15);
    const references = [garmentImage, ...(fabricImage ? [fabricImage] : []), ...(printImage ? [printImage] : [])];
    const prompt = [
      "参考图顺序：第一张是待改款服装，第二张如存在则是目标面料，第三张如存在则是目标印花。",
      "生成专业、真实的服装改款效果图。严格保留第一张服装的品类、轮廓、版型、裁片结构、领口、袖型、缝线和展示角度。",
      fabricImage ? "将服装材质替换为第二张参考图的面料，准确还原颜色、纹理、光泽、厚薄感和垂坠感。" : "除用户明确要求外，保留原服装面料与颜色。",
      printImage ? "将第三张参考图的印花准确应用到服装，保持图案比例、颜色和完整性，并按照用户描述确定印花位置。" : "不得凭空添加印花或图案。",
      "不得添加人物、文字、水印、无关配饰或额外服装，不得改变服装结构与品牌标识。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, references, prompt, `seedream-clothing-redesign-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateFaceThreeView(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const source = input.assets.find((asset) => asset.contentType.startsWith("image/"));
    if (!source) throw new ProviderRequestError("FACE_IMAGE_REQUIRED", "请上传一张清晰人脸图");
    await onProgress(15);
    const prompt = [
      "为同一人物生成一张专业脸部三视图排版图。严格保留参考人物的身份、五官比例、脸型、肤色、发型和年龄感。",
      "同一张图片横向等宽排列三个独立画面：左侧正脸，人物面向镜头并双眼平视；中间标准侧脸，头部自然旋转90度；右侧半侧脸，头部自然旋转约45度。",
      "三个画面必须是同一人物、相同中性表情、相同发型、相同柔和光线、相同浅色背景、相同头部大小和统一裁切。画面之间留出整齐间距，不添加标题、文字、边框、饰品、水印或其他人物。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [source], prompt, `seedream-face-three-view-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generatePersonFourView(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const source = input.assets.find((asset) => asset.contentType.startsWith("image/"));
    if (!source) throw new ProviderRequestError("PERSON_IMAGE_REQUIRED", "请上传一张包含脸部和身形的人物图");
    await onProgress(15);
    const prompt = [
      "为同一人物生成一张专业人物四视图排版图。严格保留参考人物的脸部身份、发型、肤色、年龄、身材比例、服装款式、颜色和细节。",
      "同一张图片以整齐网格排列四个独立画面：正面全身、侧面全身、背面全身、肩部以上的正脸特写。三个全身画面均从头到脚完整入镜，人物自然直立。",
      "四个画面必须是同一人物、相同穿搭、相同身体比例、相同柔和光线、相同浅色背景和统一写实风格。画面之间留出整齐间距，不添加标题、文字、边框、水印、道具或其他人物。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [source], prompt, `seedream-person-four-view-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateModelFaceSwap(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const [modelImage, faceImage] = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 2);
    if (!modelImage || !faceImage) throw new ProviderRequestError("FACE_SWAP_IMAGES_REQUIRED", "请上传模特图和人脸参考图");
    await onProgress(15);
    const prompt = [
      "参考图顺序：第一张是需要保留的模特主图，第二张是目标人脸与发型参考。",
      "仅将第一张图中模特的面容和发型自然替换为第二张人物，保留目标人物的脸型、五官比例、肤色、年龄感和发型特征。",
      "严格保留第一张图的身体、姿势、表情趋势、服装、配饰、背景、构图、镜头和光影，使头部角度、边缘、肤色过渡自然一致。",
      "只输出一位人物，不添加文字、水印、多余人脸或无关元素。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [modelImage, faceImage], prompt, `seedream-model-face-swap-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateFaceFusion(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const [faceOne, faceTwo] = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 2);
    if (!faceOne || !faceTwo) throw new ProviderRequestError("FACE_FUSION_IMAGES_REQUIRED", "请上传两张人脸参考图");
    await onProgress(15);
    const prompt = [
      "参考图顺序：第一张是人脸1，第二张是人脸2。",
      "生成一位全新、自然且写实的虚拟人物，均衡融合两张参考图的脸型、五官、眉眼、鼻唇、肤色和气质，不要简单拼接或明显偏向某一张。",
      "人脸结构完整对称，皮肤纹理真实，发丝和边缘自然，正面看向镜头，使用柔和棚拍光与简洁中性背景。",
      "只输出一位成年人的肩部以上肖像，不添加文字、水印、多余人脸或无关元素。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [faceOne, faceTwo], prompt, `seedream-face-fusion-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generatePersonInScene(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const [personImage, sceneImage] = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 2);
    if (!personImage || !sceneImage) throw new ProviderRequestError("PERSON_SCENE_IMAGES_REQUIRED", "请上传模特图和背景图");
    await onProgress(15);
    const prompt = [
      "参考图顺序：第一张是需要放入场景的模特，第二张是目标背景。",
      "将第一张图的人物自然、完整地融入第二张场景。严格保留人物的脸部身份、发型、肤色、身材比例、服装和配饰细节。",
      "依据场景的镜头、透视、景深和可用空间安排合理人物大小与位置，让人物接收正确的环境光、色温、阴影和反射，边缘与接地阴影真实。",
      "不改变场景的主要结构，不添加多余人物、文字、水印或无关物体。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [personImage, sceneImage], prompt, `seedream-person-in-scene-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generatePersonRealism(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const source = input.assets.find((asset) => asset.contentType.startsWith("image/"));
    if (!source) throw new ProviderRequestError("PERSON_IMAGE_REQUIRED", "请上传一张待优化人物图");
    await onProgress(15);
    const prompt = [
      "将参考图中的 AI 人物优化为自然、真实的商业摄影人像，不重新设计人物。",
      "严格保留人物身份、脸型与五官比例、表情、发型、姿势、身材、服装、背景和原始构图。",
      "优化皮肤的细微纹理、毛孔、自然瑕疵与透光感，修正眼睛、牙齿、手部、发丝边缘、服装纹理和光影中的 AI 感，保持克制真实。",
      "避免过度磨皮、塑料感、夸张锐化、改脸、多余肢体、文字或水印。",
      input.prompt,
    ].filter(Boolean).join("\n");
    const file = await this.generateImage(input, [source], prompt, `seedream-person-realism-${input.taskId}`);
    await onProgress(95);
    return [file];
  }

  private async generateProductDetailSet(input: GenerationRequestInput, onProgress: ProgressReporter): Promise<GeneratedFile[]> {
    const sources = input.assets.filter((asset) => asset.contentType.startsWith("image/")).slice(0, 5);
    if (sources.length < 1) throw new ProviderRequestError("SOURCE_IMAGE_REQUIRED", "请上传 1–5 张商品图片");
    const count = Math.max(1, Math.min(5, input.parameters.count));
    const plan = parseProductDetailPlan(input.prompt, count);
    const layouts = plan.items;
    const sharedPrompt = [
      "你正在制作同一商品的一套电商详情页视觉，所有图片必须保持商品身份、外形、颜色、材质、包装、商标和细节与参考图一致。",
      `整套图片使用统一的色彩体系、布光、质感和美术风格；输出画幅为 ${input.parameters.ratio}，清晰商业摄影。`,
      "同一套图中的每张图片必须承担不同的信息功能，主体角度、景别、背景和构图要有明显差异，不得生成两张近似画面。",
      "不得凭空修改商品结构，不得生成平台水印、二维码、无关品牌、边框或角标。",
      plan.brief,
    ].filter(Boolean).join("\n");
    const files: GeneratedFile[] = [];
    await onProgress(8);
    for (const [index, layout] of layouts.entries()) {
      const prompt = `${sharedPrompt}\n本张类型：${layout.type}。创作要求：${layout.instruction}。保持画面可直接用于电商详情页面。`;
      const references = layout.referenceIndexes.length ? layout.referenceIndexes.map((referenceIndex) => sources[referenceIndex]).filter((source): source is GenerationAsset => Boolean(source)) : sources;
      files.push(await this.generateImage(input, references.length ? references : sources, prompt, `seedream-detail-${index + 1}-${input.taskId}`));
      await onProgress(10 + Math.round(((index + 1) / layouts.length) * 85));
    }
    return files;
  }

  private async generateImage(input: GenerationRequestInput, sources: GenerationAsset[], prompt: string, baseName: string): Promise<GeneratedFile> {
    const requestBody = JSON.stringify({
      model: input.model === "seedream-image-flash" ? this.imageModel : input.model,
      prompt,
      image: sources.length === 1
        ? `data:${sources[0]!.contentType};base64,${sources[0]!.data.toString("base64")}`
        : sources.map((source) => `data:${source.contentType};base64,${source.data.toString("base64")}`),
      size: input.parameters.resolution === "2K" ? "2K" : "1K",
      response_format: "b64_json",
      output_format: input.parameters.format === "JPG" ? "jpeg" : "png",
    });
    let response: Response | undefined;
    let lastNetworkError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        response = await fetch("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: requestBody,
          signal: controller.signal,
        });
        break;
      } catch (error) {
        lastNetworkError = error;
        if (error instanceof Error && error.name === "AbortError") throw new ProviderRequestError("PROVIDER_TIMEOUT", "图片模型响应超时，请稍后重试");
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 800));
      } finally { clearTimeout(timeout); }
    }
    if (!response) {
      const cause = lastNetworkError instanceof Error && lastNetworkError.cause instanceof Error ? lastNetworkError.cause.message : lastNetworkError instanceof Error ? lastNetworkError.message : "未知网络错误";
      throw new ProviderRequestError("PROVIDER_NETWORK_ERROR", `图片模型连接失败，已自动重试：${cause}`);
    }
    const body = await response.json().catch(() => ({})) as ArkImageResponse;
    if (!response.ok || body.error) throw new ProviderRequestError(body.error?.code ?? `PROVIDER_HTTP_${response.status}`, body.error?.message ?? `火山方舟请求失败（${response.status}）`);
    const result = body.data?.[0];
    if (result?.error) throw new ProviderRequestError(result.error.code ?? "PROVIDER_IMAGE_FAILED", result.error.message ?? "图片生成失败");
    if (!result?.b64_json) throw new ProviderRequestError("PROVIDER_EMPTY_OUTPUT", "火山方舟未返回图片数据");
    const data = Buffer.from(result.b64_json, "base64");
    const metadata = await sharp(data).metadata();
    const format = result.output_format === "jpeg" || input.parameters.format === "JPG" ? "jpg" : "png";
    return { name: `${baseName}.${format}`, contentType: format === "jpg" ? "image/jpeg" : "image/png", data, width: metadata.width ?? 1024, height: metadata.height ?? 1024 };
  }
}

/** 配置火山方舟时调用真实 Seedream；未配置时仅保留可明确验收的本地图片处理。 */
export function createModelProvider(environment: NodeJS.ProcessEnv = process.env): ModelProvider {
  if (environment.AI_PROVIDER === "volcengine_ark" && environment.ARK_API_KEY) {
    return new VolcengineArkProvider(environment.ARK_API_KEY, environment.ARK_IMAGE_MODEL ?? "");
  }
  return new LocalImageToolsProvider();
}

type ArkVideoCreateResponse = { id?: string };
type ArkVideoTaskResponse = {
  status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
  content?: { video_url?: string };
  error?: { code?: string; message?: string };
  usage?: { completion_tokens?: number; total_tokens?: number };
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new ProviderRequestError("PROVIDER_TIMEOUT", "火山方舟请求超时，请稍后重试");
    throw new ProviderRequestError("PROVIDER_NETWORK_ERROR", error instanceof Error ? `火山方舟连接失败：${error.message}` : "火山方舟连接失败");
  } finally { clearTimeout(timeout); }
}

function videoDimensions(resolution: GenerationParameters["resolution"], ratio: GenerationParameters["ratio"]): { width: number; height: number } {
  const shortEdge = resolution === "1080p" ? 1080 : resolution === "720p" ? 720 : 480;
  if (ratio === "1:1") return { width: shortEdge, height: shortEdge };
  if (ratio === "9:16") return { width: shortEdge, height: Math.round(shortEdge * 16 / 9) };
  if (ratio === "3:4") return { width: shortEdge, height: Math.round(shortEdge * 4 / 3) };
  return { width: Math.round(shortEdge * 16 / 9), height: shortEdge };
}

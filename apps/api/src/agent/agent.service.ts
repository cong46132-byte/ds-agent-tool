import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { prisma } from "@ds/database";
import { agentIntentSchema, type AgentIntent, type AgentRouteRequest, type AgentRouteResponse, type DirectorScriptRequest } from "@ds/contracts";
import { StorageService } from "../assets/storage.service.js";

type SlotSpec = { key: string; label: string; options: string[]; required?: boolean };

type RouteDef = { intent: AgentIntent; label: string; keywords: string[]; targetPath: string; slots: SlotSpec[] };

const routes: ReadonlyArray<RouteDef> = [
  { intent: "product_detail_set", label: "商详套图", keywords: ["详情页", "详情图", "商详", "套图"], targetPath: "/create/product-detail-set", slots: [
    { key: "count", label: "张数", options: ["3", "4", "5"] },
    { key: "language", label: "文案语言", options: ["中文", "英文"] },
    { key: "quality", label: "清晰度", options: ["1K", "2K"] },
  ] },
  { intent: "video_recreation", label: "深度复刻", keywords: ["复刻", "参考视频", "同款视频"], targetPath: "/create/video-recreation", slots: [] },
  { intent: "virtual_try_on", label: "服装上身", keywords: ["服装上身", "试穿", "换装"], targetPath: "/create/virtual-try-on", slots: [] },
  { intent: "product_white_background", label: "商品白底图", keywords: ["白底图", "商品白底"], targetPath: "/image", slots: [
    { key: "resolution", label: "分辨率", options: ["1K", "2K"] },
    { key: "format", label: "格式", options: ["PNG", "JPG"] },
  ] },
  { intent: "image_retouche", label: "图片精修", keywords: ["精修", "修图", "图片优化"], targetPath: "/image?tool=image-retouche", slots: [] },
  { intent: "product_use", label: "商品使用", keywords: ["商品使用", "产品使用", "真人试用"], targetPath: "/image?tool=product-use", slots: [] },
  { intent: "clothing_redesign", label: "服装改款", keywords: ["服装改款", "衣服改款", "替换面料", "替换印花"], targetPath: "/image?tool=clothing-redesign", slots: [] },
  { intent: "face_three_view", label: "脸部三视图", keywords: ["脸部三视图", "人脸三视图"], targetPath: "/image?tool=face-three-view", slots: [] },
  { intent: "person_four_view", label: "人物四视图", keywords: ["人物四视图", "模特四视图"], targetPath: "/image?tool=person-four-view", slots: [] },
  { intent: "model_face_swap", label: "模特换脸", keywords: ["模特换脸", "人物换脸", "换脸"], targetPath: "/image?tool=model-face-swap", slots: [] },
  { intent: "face_fusion", label: "人脸融合", keywords: ["人脸融合", "脸部融合"], targetPath: "/image?tool=face-fusion", slots: [] },
  { intent: "person_in_scene", label: "人物入景", keywords: ["人物入景", "模特换背景", "人物融入场景"], targetPath: "/image?tool=person-in-scene", slots: [] },
  { intent: "person_realism", label: "人物真人感", keywords: ["人物真人感", "去AI感", "去 ai 感", "人像真实感"], targetPath: "/image?tool=person-realism", slots: [] },
  { intent: "director_video", label: "超级编导", keywords: ["带货视频", "广告视频", "脚本", "分镜", "超级编导"], targetPath: "/create/ecommerce-video", slots: [
    { key: "category", label: "场景类型", options: ["电商带货", "同城到店", "剧情短片", "品牌广告"], required: true },
    { key: "duration", label: "时长", options: ["4s", "5s", "10s", "15s", "30s", "60s"] },
    { key: "ratio", label: "比例", options: ["9:16", "16:9", "1:1"] },
  ] },
];

type LlmJudgeResult = { intent: AgentIntent; slots: Record<string, string>; reply: string | null };

@Injectable()
export class AgentService {
  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  async createDirectorScript(userId: string, input: DirectorScriptRequest): Promise<{ script: string }> {
    const assets = input.assetIds.length ? await prisma.asset.findMany({ where: { id: { in: input.assetIds }, ownerId: userId }, include: { file: true } }) : [];
    if (assets.length !== input.assetIds.length) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "部分素材不存在或无权访问" });
    const ordered = input.assetIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is (typeof assets)[number] => Boolean(asset));
    const { ARK_API_KEY, ARK_TEXT_MODEL, ARK_VISION_MODEL } = process.env;
    const model = ARK_VISION_MODEL || ARK_TEXT_MODEL;
    if (!ARK_API_KEY || !model) throw new ServiceUnavailableException({ code: "DIRECTOR_MODEL_NOT_CONFIGURED", message: "超级编导分析模型尚未配置" });
    const content: Array<Record<string, unknown>> = [{ type: "text", text: [
      `视频类型：${input.category}`,
      `模板：${input.template}`,
      input.requirement ? `用户要求：${input.requirement}` : "请根据素材主动完成专业策划。",
      `素材共 ${ordered.length} 个，请按上传顺序使用 @图片1、@音频1 等方式明确引用。`,
    ].join("\n") }];
    for (const asset of ordered) {
      if (asset.kind === "IMAGE") {
        const data = await this.storageService.get().getObject(asset.file.objectKey);
        if (data.length > 15 * 1024 * 1024) throw new ServiceUnavailableException({ code: "DIRECTOR_ASSET_TOO_LARGE", message: `${asset.name} 超过 15MB，请压缩后重试` });
        content.push({ type: "image_url", image_url: { url: `data:${asset.file.mimeType};base64,${data.toString("base64")}` } });
      } else {
        content.push({ type: "text", text: `参考素材：${asset.name}（${asset.kind === "AUDIO" ? "音频" : "视频"}）` });
      }
    }
    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${ARK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.45, messages: [
        { role: "system", content: "你是资深电商视频编导。请先分析素材，再生成可直接交给视频模型的中文脚本。只输出 Markdown，必须包含：素材分析报告（识别信息、卖点与受众）、剧情概述、素材与职责、主体与全片设定、分镜脚本（按时间段写景别/画面/动作/运镜/台词或字幕/声音）、生成约束。不要虚构看不清的品牌文字或规格。" },
        { role: "user", content },
      ] }),
    });
    const body = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { code?: string; message?: string } };
    if (!response.ok || body.error) throw new ServiceUnavailableException({ code: body.error?.code ?? "DIRECTOR_MODEL_FAILED", message: body.error?.message ?? `脚本模型请求失败（${response.status}）` });
    const script = body.choices?.[0]?.message?.content?.trim();
    if (!script) throw new ServiceUnavailableException({ code: "DIRECTOR_EMPTY_SCRIPT", message: "编导模型未返回脚本，请调整要求后重试" });
    return { script };
  }

  async route(userId: string, input: AgentRouteRequest): Promise<AgentRouteResponse> {
    if (input.assetIds.length) {
      const ownedAssets = await prisma.asset.count({ where: { id: { in: input.assetIds }, ownerId: userId } });
      if (ownedAssets !== input.assetIds.length) throw new NotFoundException({ code: "ASSET_NOT_FOUND", message: "部分素材不存在或无权访问" });
    }

    const llm = await this.judgeWithLlm(input).catch(() => null);
    const match = llm ? routes.find((route) => route.intent === llm.intent) ?? null : this.keywordMatch(input);
    const intent = llm?.intent ?? match?.intent ?? "unclear";

    if (!match) {
      return {
        intent: "unclear", confidence: llm?.intent === "unclear" ? 0.55 : 0.35,
        reply: llm?.reply ?? (input.assetIds.length
          ? "我还不确定你想生成哪种内容。请选择：商详套图、商品白底图、图片精修，还是视频内容？"
          : "你想做什么类型的图片？例如商详套图、商品白底图或图片精修。你是否有产品图可以上传？"),
        targetPath: null, transferredAssetIds: input.assetIds, requiresClarification: true, slots: {},
      };
    }

    const slots = this.mergeSlots(match, input, llm?.slots ?? this.extractSlotsByKeyword(match, input.message));

    if (match.intent === "product_detail_set" && input.assetIds.length === 0) {
      return { intent: match.intent, confidence: 0.82, reply: "可以，请先上传 1–5 张清晰产品图，我会带入商详套图流程。", targetPath: null, transferredAssetIds: [], requiresClarification: true, slots };
    }

    const missing = match.slots.filter((slot) => slot.required && !slots[slot.key]);
    if (missing.length) {
      const question = missing.map((slot) => `${slot.label}（${slot.options.join(" / ")}）`).join("、");
      return {
        intent: match.intent, confidence: llm ? 0.8 : 0.7,
        reply: `想做${match.label}～再确认一下：${question}？`,
        targetPath: null, transferredAssetIds: input.assetIds, requiresClarification: true, slots,
      };
    }

    const summary = match.slots.filter((slot) => slots[slot.key]).map((slot) => `${slot.label} ${slots[slot.key]}`).join(" · ");
    return {
      intent: match.intent, confidence: llm ? 0.93 : 0.8,
      reply: llm?.reply ?? `已识别为${match.label}${summary ? `（${summary}）` : ""}，随时可以打开创作流程。`,
      targetPath: match.targetPath, transferredAssetIds: input.assetIds, requiresClarification: false, slots,
    };
  }

  private keywordMatch(input: AgentRouteRequest): RouteDef | null {
    const normalized = input.message.toLowerCase();
    const currentMatch = routes.find((route) => route.keywords.some((keyword) => normalized.includes(keyword)));
    const contextualMatch = [...input.history].reverse()
      .filter((message) => message.role === "user")
      .map((message) => routes.find((route) => route.keywords.some((keyword) => message.text.toLowerCase().includes(keyword))))
      .find(Boolean);
    return currentMatch ?? contextualMatch ?? null;
  }

  private mergeSlots(route: RouteDef, input: AgentRouteRequest, extracted: Record<string, string>) {
    const allowed = new Set(route.slots.map((slot) => slot.key));
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.slots)) if (allowed.has(key)) merged[key] = String(value);
    for (const [key, value] of Object.entries(extracted)) if (allowed.has(key)) merged[key] = String(value);
    return merged;
  }

  private extractSlotsByKeyword(route: RouteDef, message: string) {
    const normalized = message.toLowerCase();
    const slots: Record<string, string> = {};
    for (const slot of route.slots) {
      const hit = slot.options.find((option) => normalized.includes(option.toLowerCase()));
      if (hit) slots[slot.key] = hit;
    }
    return slots;
  }

  /** 已配置火山方舟文本模型时用 LLM 判断意图并抽取参数；未配置或任何异常都返回 null，由关键词逻辑兜底。 */
  private async judgeWithLlm(input: AgentRouteRequest): Promise<LlmJudgeResult | null> {
    const { AI_PROVIDER, ARK_API_KEY, ARK_TEXT_MODEL } = process.env;
    if (AI_PROVIDER !== "volcengine_ark" || !ARK_API_KEY || !ARK_TEXT_MODEL) {
      console.log(`[agent] LLM 未启用（AI_PROVIDER=${AI_PROVIDER ?? "未设置"}, ARK_TEXT_MODEL=${ARK_TEXT_MODEL ? "已设置" : "未设置"}），使用关键词兜底`);
      return null;
    }

    const intentList = routes.map((route) => `${route.intent}（${route.label}）`).join("、") + "、unclear（无法判断）";
    const slotList = routes.filter((route) => route.slots.length)
      .map((route) => `${route.intent}: ${route.slots.map((slot) => `${slot.key} 可选 [${slot.options.join(", ")}]`).join("；")}`).join("\n");
    const system = [
      "你是电商 AI 创作平台的创作助手，负责理解用户的创作需求并路由到对应功能。",
      `只输出 JSON（不要输出其他内容），格式：{"intent": <意图>, "slots": {<参数键>: <参数值>}, "reply": "<给用户的一两句中文回复，口语化>"}。`,
      `intent 只能是以下之一：${intentList}。`,
      "slots 只提取用户明确提到或上一轮对话已确认的参数，值必须是给定选项之一：",
      slotList,
      "无法判断意图时 intent 填 unclear，并在 reply 里追问一个最关键的问题。",
    ].join("\n");
    const history = input.history.slice(-10).map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.text}`).join("\n");
    const user = [history && `对话历史：\n${history}`, `用户最新输入：${input.message}`, input.assetIds.length ? `用户已附带 ${input.assetIds.length} 个素材。` : ""].filter(Boolean).join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${ARK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ARK_TEXT_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      console.error(`[agent] LLM 请求失败：HTTP ${response.status} ${(await response.text().catch(() => "")).slice(0, 300)}`);
      return null;
    }
    const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[agent] LLM 返回为空：${JSON.stringify(body).slice(0, 300)}`);
      return null;
    }
    const parsed = JSON.parse(content) as { intent?: string; slots?: Record<string, string>; reply?: string };
    const intent = agentIntentSchema.safeParse(parsed.intent);
    if (!intent.success) {
      console.error(`[agent] LLM 返回非法 intent：${content.slice(0, 200)}`);
      return null;
    }
    return { intent: intent.data, slots: typeof parsed.slots === "object" && parsed.slots ? parsed.slots : {}, reply: typeof parsed.reply === "string" ? parsed.reply : null };
  }
}

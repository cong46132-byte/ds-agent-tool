"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderOpen, ImagePlus, Layers3, LoaderCircle, Sparkles, WandSparkles, X, type LucideIcon } from "lucide-react";
import { AssetPickerModal } from "../../components/asset-picker-modal";
import { ImageResultModal } from "../../components/image-result-modal";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, ApiError, hasSession, type Asset, uploadAsset } from "../../lib/api";
import { FALLBACK_GENERATION_DEFAULTS, type CapabilityDefaults, type PlatformCatalog } from "../../lib/generation-defaults";

type Tool = {
  title: string;
  description: string;
  route: string;
  tone: string;
  input: string;
  icon: LucideIcon;
  ready?: boolean;
};

type PreviewTask = { id: string; status: string; progress: number; errorMessage: string | null; outputs?: Array<{ assetId: string }> };
type RecentTask = PreviewTask & { capability: string; createdAt: string };

const groups: Array<{ eyebrow: string; title: string; tools: Tool[] }> = [
  { eyebrow: "PERSON", title: "人物工具", tools: [
    { title: "脸部三视图", description: "生成正脸、侧脸、半侧脸参考", route: "/create/face-three-view", tone: "image-green", input: "上传清晰的正面人脸图", icon: Layers3, ready: true },
    { title: "人物四视图", description: "生成全身三视角与脸部特写", route: "/create/person-four-view", tone: "image-gold", input: "上传包含脸部和身形的人物图", icon: Layers3, ready: true },
    { title: "模特换脸", description: "一键替换面容与发型", route: "/create/model-face-swap", tone: "image-amber", input: "分别上传模特图和人脸参考图", icon: WandSparkles, ready: true },
    { title: "人脸融合", description: "融合两张人脸生成新虚拟形象", route: "/create/face-fusion", tone: "image-earth", input: "上传两张人脸参考图", icon: Sparkles, ready: true },
  ] },
  { eyebrow: "GOODS", title: "商品工具", tools: [
    { title: "服装上身", description: "替换模特身上的服装衣物", route: "/create/virtual-try-on", tone: "image-gold", input: "上传模特图和服装图", icon: ImagePlus, ready: true },
    { title: "商品使用", description: "生成真人试用与使用场景", route: "/create/product-use", tone: "image-amber", input: "上传产品图与人物参考图", icon: ImagePlus, ready: true },
    { title: "商品白底图", description: "生成标准白底图与多角度视图", route: "/create/product-white-background", tone: "image-green", input: "上传一张商品图", icon: Sparkles, ready: true },
    { title: "服装改款", description: "替换服装的面料、印花等", route: "/create/clothing-redesign", tone: "image-deep-green", input: "上传服装图与面料或印花参考", icon: WandSparkles, ready: true },
  ] },
  { eyebrow: "MISC", title: "其他工具", tools: [
    { title: "人物入景", description: "将人物自然融入指定场景", route: "/create/person-in-scene", tone: "image-plum", input: "上传人物图和场景图", icon: ImagePlus, ready: true },
    { title: "人物真人感", description: "优化 AI 人物的皮肤与光影质感", route: "/create/person-realism", tone: "image-blue", input: "上传待优化的人物图", icon: Sparkles, ready: true },
    { title: "图片精修", description: "美颜、清晰度与商品质感增强", route: "/create/image-retouche", tone: "image-earth", input: "上传待精修图片", icon: WandSparkles, ready: true },
  ] },
];

const capabilityToolKeys: Record<string, string> = {
  virtual_try_on: "virtual-try-on", product_use: "product-use", clothing_redesign: "clothing-redesign",
  face_three_view: "face-three-view", person_four_view: "person-four-view", model_face_swap: "model-face-swap",
  face_fusion: "face-fusion", person_in_scene: "person-in-scene", person_realism: "person-realism",
  product_white_background: "product-white-background", image_retouche: "image-retouche",
};

export default function ImageHubPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const upperRef = useRef<HTMLInputElement>(null);
  const lowerRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Tool>(groups[1]!.tools[2]!);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [preview, setPreview] = useState("");
  const [upperAsset, setUpperAsset] = useState<Asset | null>(null);
  const [upperPreview, setUpperPreview] = useState("");
  const [lowerAsset, setLowerAsset] = useState<Asset | null>(null);
  const [lowerPreview, setLowerPreview] = useState("");
  const [instructions, setInstructions] = useState("");
  const [resolution, setResolution] = useState("1K");
  const [format, setFormat] = useState("PNG");
  const [model, setModel] = useState<string>(FALLBACK_GENERATION_DEFAULTS.imageModel);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"model" | "upper" | "lower" | null>(null);
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [previewTask, setPreviewTask] = useState<PreviewTask | null>(null);
  const [resultUrls, setResultUrls] = useState<string[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [recentPreviewUrls, setRecentPreviewUrls] = useState<Record<string, string>>({});
  const [defaultConfig, setDefaultConfig] = useState<CapabilityDefaults>({ model: FALLBACK_GENERATION_DEFAULTS.imageModel, ratio: "1:1", resolution: FALLBACK_GENERATION_DEFAULTS.imageResolution, format: FALLBACK_GENERATION_DEFAULTS.imageFormat, count: 1 });

  useEffect(() => {
    const toolKey = new URLSearchParams(window.location.search).get("tool");
    if (!toolKey) return;
    const requested = groups.flatMap((group) => group.tools).find((tool) => tool.route === `/create/${toolKey}`);
    if (requested) setSelected(requested);
  }, []);

  useEffect(() => {
    if (!hasSession()) return void router.replace("/auth?next=/image");
    Promise.all([apiRequest("/auth/me"), apiRequest<PlatformCatalog>("/platform/catalog")]).then(([, catalog]) => {
      const defaults = catalog.defaults.product_white_background;
      if (defaults) { setDefaultConfig(defaults); setModel(defaults.model); setResolution(defaults.resolution); setFormat(defaults.format); }
      setReady(true);
    }).catch(() => router.replace("/auth?next=/image"));
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem("generation_draft") ?? "null") as { capability?: string; assetIds?: string[]; prompt?: string; parameters?: { resolution?: string; format?: string } } | null;
      if (!draft?.capability) return;
      const toolKey = capabilityToolKeys[draft.capability];
      if (!toolKey) return;
      sessionStorage.removeItem("generation_draft");
      const requested = groups.flatMap((group) => group.tools).find((tool) => tool.route === `/create/${toolKey}`);
      if (requested) setSelected(requested);
      setInstructions(draft.prompt ?? "");
      if (draft.parameters?.resolution === "1K" || draft.parameters?.resolution === "2K") setResolution(draft.parameters.resolution);
      if (draft.parameters?.format === "PNG" || draft.parameters?.format === "JPG") setFormat(draft.parameters.format);
      if (draft.assetIds?.length) void restoreInputAssets(draft.assetIds, "原素材恢复失败，请重新选择图片");
    } catch { sessionStorage.removeItem("generation_draft"); }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      const transfer = JSON.parse(sessionStorage.getItem("agent_transfer") ?? "null") as { assetIds?: string[]; targetPath?: string; createdAt?: number } | null;
      if (!transfer?.targetPath?.startsWith("/image?tool=") || typeof transfer.createdAt !== "number" || Date.now() - transfer.createdAt >= 30_000) return;
      sessionStorage.removeItem("agent_transfer");
      if (transfer.assetIds?.length) void restoreInputAssets(transfer.assetIds, "Agent 素材带入失败，请重新选择");
    } catch { sessionStorage.removeItem("agent_transfer"); }
  }, [ready]);

  async function restoreInputAssets(ids: string[], failureMessage: string) {
    try {
      const result = await apiRequest<{ items: Asset[] }>("/assets?kind=IMAGE&pageSize=50");
      const restored = ids.slice(0, 3).map((id) => result.items.find((item) => item.id === id)).filter((item): item is Asset => Boolean(item));
      if (!restored.length) return void setNotice("原素材已不存在，请重新选择图片");
      const downloads = await Promise.all(restored.map((item) => apiRequest<{ url: string }>(`/assets/${item.id}/download-url`)));
      setAsset(restored[0] ?? null); setPreview(downloads[0]?.url ?? "");
      setUpperAsset(restored[1] ?? null); setUpperPreview(downloads[1]?.url ?? "");
      setLowerAsset(restored[2] ?? null); setLowerPreview(downloads[2]?.url ?? "");
    } catch { setNotice(failureMessage); }
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const loadRecentTasks = useCallback(async () => {
    const capability = selected.route === "/create/virtual-try-on" ? "virtual_try_on" : selected.route === "/create/product-use" ? "product_use" : selected.route === "/create/clothing-redesign" ? "clothing_redesign" : selected.route === "/create/face-three-view" ? "face_three_view" : selected.route === "/create/person-four-view" ? "person_four_view" : selected.route === "/create/model-face-swap" ? "model_face_swap" : selected.route === "/create/face-fusion" ? "face_fusion" : selected.route === "/create/person-in-scene" ? "person_in_scene" : selected.route === "/create/person-realism" ? "person_realism" : selected.route === "/create/image-retouche" ? "image_retouche" : selected.route === "/create/product-white-background" ? "product_white_background" : null;
    if (!capability) { setRecentTasks([]); setRecentPreviewUrls({}); return; }
    try {
      const response = await apiRequest<{ items: RecentTask[] }>("/tasks");
      const items = response.items.filter((task) => task.capability === capability).slice(0, 40);
      setRecentTasks(items);
      const previews = await Promise.allSettled(items.flatMap((task) => task.outputs?.[0]?.assetId ? [{ taskId: task.id, assetId: task.outputs[0].assetId }] : []).map(async ({ taskId, assetId }) => {
        const download = await apiRequest<{ url: string }>(`/assets/${assetId}/download-url`);
        return [taskId, download.url] as const;
      }));
      setRecentPreviewUrls(Object.fromEntries(previews.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : [])));
    } catch { setRecentTasks([]); setRecentPreviewUrls({}); }
  }, [selected.route]);

  useEffect(() => { if (ready) void loadRecentTasks(); }, [ready, loadRecentTasks]);

  useEffect(() => {
    if (!previewTask || (previewTask.status !== "QUEUED" && previewTask.status !== "RUNNING")) return;
    let disposed = false;
    const timer = window.setInterval(() => {
      void apiRequest<PreviewTask>(`/tasks/${previewTask.id}`).then(async (task) => {
        if (disposed) return;
        const outputIds = task.outputs?.map((output) => output.assetId) ?? [];
        if (task.status === "SUCCEEDED" && outputIds.length) {
          const downloads = await Promise.all(outputIds.map((outputId) => apiRequest<{ url: string }>(`/assets/${outputId}/download-url`)));
          if (!disposed) setResultUrls(downloads.map((download) => download.url));
        }
        if (!disposed) {
          setPreviewTask(task);
          if (task.status !== "QUEUED" && task.status !== "RUNNING") void loadRecentTasks();
        }
      }).catch((reason) => {
        if (!disposed) setNotice(reason instanceof ApiError ? reason.message : "生成状态获取失败");
      });
    }, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [previewTask?.id, previewTask?.status, loadRecentTasks]);

  useEffect(() => {
    const outputIds = previewTask?.status === "SUCCEEDED" ? previewTask.outputs?.map((output) => output.assetId) ?? [] : [];
    if (!outputIds.length || resultUrls.length) return;
    void Promise.all(outputIds.map((outputId) => apiRequest<{ url: string }>(`/assets/${outputId}/download-url`))).then((downloads) => setResultUrls(downloads.map((download) => download.url))).catch(() => setNotice("生成结果地址获取失败，请从生成记录重新打开"));
  }, [previewTask, resultUrls.length]);

  function chooseTool(tool: Tool) {
    if (preview) URL.revokeObjectURL(preview);
    if (upperPreview) URL.revokeObjectURL(upperPreview);
    if (lowerPreview) URL.revokeObjectURL(lowerPreview);
    setSelected(tool); setAsset(null); setPreview(""); setUpperAsset(null); setUpperPreview(""); setLowerAsset(null); setLowerPreview(""); setAuthorizationConfirmed(false); setTemplateOpen(false); setInstructions(""); setNotice("");
  }

  function resetPanel() {
    if (preview) URL.revokeObjectURL(preview);
    if (upperPreview) URL.revokeObjectURL(upperPreview);
    if (lowerPreview) URL.revokeObjectURL(lowerPreview);
    setAsset(null); setPreview(""); setUpperAsset(null); setUpperPreview(""); setLowerAsset(null); setLowerPreview(""); setAuthorizationConfirmed(false); setTemplateOpen(false); setInstructions(""); setModel(defaultConfig.model); setResolution(defaultConfig.resolution); setFormat(defaultConfig.format); setNotice("");
  }

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void setNotice("仅支持 PNG、JPG、JPEG、WebP 图片");
    if (file.size > 20 * 1024 * 1024) return void setNotice("图片不能超过 20MB");
    setBusy(true); setNotice("");
    try {
      const uploaded = await uploadAsset(file);
      if (preview) URL.revokeObjectURL(preview);
      setAsset(uploaded); setPreview(URL.createObjectURL(file));
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "素材上传失败"); }
    finally { setBusy(false); }
  }

  async function chooseTryOnImage(target: "upper" | "lower", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void setNotice("仅支持 PNG、JPG、JPEG、WebP 图片");
    if (file.size > 20 * 1024 * 1024) return void setNotice("图片不能超过 20MB");
    setBusy(true); setNotice("");
    try {
      const uploaded = await uploadAsset(file);
      const url = URL.createObjectURL(file);
      if (target === "upper") { if (upperPreview) URL.revokeObjectURL(upperPreview); setUpperAsset(uploaded); setUpperPreview(url); }
      else { if (lowerPreview) URL.revokeObjectURL(lowerPreview); setLowerAsset(uploaded); setLowerPreview(url); }
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "素材上传失败"); }
    finally { setBusy(false); }
  }

  function applyPickedAsset(picked: Asset, url: string) {
    if (pickerTarget === "upper") { if (upperPreview) URL.revokeObjectURL(upperPreview); setUpperAsset(picked); setUpperPreview(url); }
    else if (pickerTarget === "lower") { if (lowerPreview) URL.revokeObjectURL(lowerPreview); setLowerAsset(picked); setLowerPreview(url); }
    else { if (preview) URL.revokeObjectURL(preview); setAsset(picked); setPreview(url); }
    setPickerTarget(null); setNotice("");
  }

  async function generate() {
    const isTryOn = selected.route === "/create/virtual-try-on";
    const isProductUse = selected.route === "/create/product-use";
    const isClothingRedesign = selected.route === "/create/clothing-redesign";
    const isFaceThreeView = selected.route === "/create/face-three-view";
    const isPersonFourView = selected.route === "/create/person-four-view";
    const isModelFaceSwap = selected.route === "/create/model-face-swap";
    const isFaceFusion = selected.route === "/create/face-fusion";
    const isPersonInScene = selected.route === "/create/person-in-scene";
    const isPersonRealism = selected.route === "/create/person-realism";
    const isImageRetouche = selected.route === "/create/image-retouche";
    const requiresSecondImage = isTryOn || isProductUse || isModelFaceSwap || isFaceFusion || isPersonInScene;
    if (!selected.ready || !asset || busy || (requiresSecondImage && !upperAsset) || ((isTryOn || isModelFaceSwap || isFaceFusion || isPersonInScene || isPersonRealism) && !authorizationConfirmed)) return;
    setBusy(true); setNotice("");
    try {
      const task = await apiRequest<PreviewTask>("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), capability: isTryOn ? "virtual_try_on" : isProductUse ? "product_use" : isClothingRedesign ? "clothing_redesign" : isFaceThreeView ? "face_three_view" : isPersonFourView ? "person_four_view" : isModelFaceSwap ? "model_face_swap" : isFaceFusion ? "face_fusion" : isPersonInScene ? "person_in_scene" : isPersonRealism ? "person_realism" : isImageRetouche ? "image_retouche" : "product_white_background", assetIds: isTryOn ? [asset.id, upperAsset!.id, ...(lowerAsset ? [lowerAsset.id] : [])] : isProductUse || isModelFaceSwap || isFaceFusion || isPersonInScene ? [asset.id, upperAsset!.id] : isClothingRedesign ? [asset.id, ...(upperAsset ? [upperAsset.id] : []), ...(lowerAsset ? [lowerAsset.id] : [])] : [asset.id],
        prompt: instructions || (isTryOn ? "自然上身，保留人物身份、服装版型、颜色、纹理和图案" : isProductUse ? "让人物自然使用商品，保留人物身份和商品外观细节" : isClothingRedesign ? "保留服装版型与结构，根据参考图替换面料和印花" : isFaceThreeView ? "保持人物身份一致，生成统一光线和背景的脸部三视图" : isPersonFourView ? "保持人物身份、身材与穿搭一致，生成统一的人物四视图" : isModelFaceSwap ? "自然替换模特面容与发型，保留原图姿势、服装、构图和光影" : isFaceFusion ? "均衡融合两张人脸，生成自然写实的新虚拟形象" : isPersonInScene ? "将人物自然融入目标背景，保持身份、穿搭和场景透视光影一致" : isPersonRealism ? "减弱 AI 感，增强人物的皮肤、发丝、手部与光影真实感" : isImageRetouche ? "自然修复画面瑕疵，增强清晰度、色彩和质感，保留主体身份与关键细节" : "保留商品细节，生成纯白背景的居中电商主图"),
        parameters: { model, ratio: defaultConfig.ratio, resolution, format, count: 1, ...((isTryOn || isModelFaceSwap || isFaceFusion || isPersonInScene || isPersonRealism) ? { authorizationConfirmed: true } : {}) },
      }) });
      setResultUrls([]); setPreviewTask(task);
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "生成任务提交失败"); }
    finally { setBusy(false); }
  }

  if (!ready) return <main className="route-message"><LoaderCircle className="spin" /><p>正在加载图片创作工作台…</p></main>;

  const isTryOn = selected.route === "/create/virtual-try-on";
  const isProductUse = selected.route === "/create/product-use";
  const isClothingRedesign = selected.route === "/create/clothing-redesign";
  const isWhiteBackground = selected.route === "/create/product-white-background";
  const isFaceThreeView = selected.route === "/create/face-three-view";
  const isPersonFourView = selected.route === "/create/person-four-view";
  const isModelFaceSwap = selected.route === "/create/model-face-swap";
  const isFaceFusion = selected.route === "/create/face-fusion";
  const isPersonInScene = selected.route === "/create/person-in-scene";
  const isPersonRealism = selected.route === "/create/person-realism";
  const isImageRetouche = selected.route === "/create/image-retouche";
  const isViewGeneration = isFaceThreeView || isPersonFourView;
  const isMultiInput = isTryOn || isProductUse || isClothingRedesign || isModelFaceSwap || isFaceFusion || isPersonInScene;
  const usesCompactUpload = isMultiInput || isWhiteBackground || isViewGeneration || isPersonRealism || isImageRetouche;

  return (
    <div className="studio-shell image-hub-shell">
      <StudioSidebar />
      <main className="image-hub-main">
        <header className="image-hub-header">
          <p className="product-kicker">AI IMAGE · 图片创作</p>
          <div className="image-hub-title">
            <h1>图片功能</h1>
            <nav>
              <button onClick={() => router.push("/create/product-detail-set")} type="button">
                <Layers3 />商详套图 <small>高转化详情视觉方案</small>
              </button>
              <button className="selected" type="button">
                <WandSparkles />图片创作 <small>AI 技能一键调用</small>
              </button>
            </nav>
          </div>
        </header>
        <section className="image-hub-intro">
          <Sparkles aria-hidden="true" />
          <p>无需学习提示词：将复杂的 AI 创作流程封装为<strong>一键操作</strong>的专业功能模块，让每个人都能轻松完成高质量 AI 创作。</p>
        </section>
        {groups.map((group) => (
          <section className="image-tool-group" key={group.eyebrow}>
            <header>
              <span>{group.eyebrow}</span>
              <h2>{group.title}</h2>
            </header>
            <div>
              {group.tools.map((tool) => {
                const Icon = tool.icon;
                const isSelected = selected.title === tool.title;
                return (
                  <button className={`image-tool-card ${isSelected ? "selected" : ""}`} key={tool.title} onClick={() => chooseTool(tool)} type="button">
                    <span className={`image-tool-visual ${tool.tone}`}>
                      <i /><b />
                      <span className="image-tool-icon"><Icon aria-hidden="true" /></span>
                      {tool.ready && <em>已接入</em>}
                      {isSelected && <span className="image-tool-check"><Check aria-hidden="true" /></span>}
                    </span>
                    <span className="image-tool-copy">
                      <strong>{tool.title}</strong>
                      <small>{tool.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <aside className="image-tool-panel">
        <header>
          <span className="image-panel-badge"><WandSparkles /></span>
          <strong>{selected.title}</strong>
          <button onClick={resetPanel} type="button">＋ 新建</button>
        </header>
        <div>
          <div className="image-input-heading"><label>输入素材 <em>· {isTryOn || isClothingRedesign ? "3 项" : isProductUse || isModelFaceSwap || isFaceFusion || isPersonInScene ? "2 项" : usesCompactUpload ? "1 项" : "必填"}</em></label>{usesCompactUpload && <button className="try-on-template-trigger" onClick={() => setTemplateOpen(true)} type="button"><ImagePlus />{isProductUse ? "商品使用" : isClothingRedesign ? "服装改款" : isWhiteBackground ? "商品白底图" : isFaceThreeView ? "脸部三视图" : isPersonFourView ? "人物四视图" : isModelFaceSwap ? "模特换脸" : isFaceFusion ? "人脸融合" : isPersonInScene ? "人物入景" : isPersonRealism ? "人物真人感" : isImageRetouche ? "图片精修" : "服装上身"}</button>}</div>
          {usesCompactUpload ? <div className={`try-on-upload-grid hub-try-on-grid ${isProductUse ? "product-use-upload-grid" : ""} ${isWhiteBackground ? "white-background-upload-grid" : ""}`}>{(isTryOn ? [
            { key: "model", label: "添加模特", optional: false, item: asset, url: preview, ref: inputRef },
            { key: "upper", label: "添加上身/全身装", optional: false, item: upperAsset, url: upperPreview, ref: upperRef },
            { key: "lower", label: "添加下装", optional: true, item: lowerAsset, url: lowerPreview, ref: lowerRef },
          ] : isProductUse ? [
            { key: "model", label: "添加模特", optional: false, item: asset, url: preview, ref: inputRef },
            { key: "upper", label: "添加商品", optional: false, item: upperAsset, url: upperPreview, ref: upperRef },
          ] : isClothingRedesign ? [
            { key: "model", label: "添加服装", optional: false, item: asset, url: preview, ref: inputRef },
            { key: "upper", label: "添加面料", optional: true, item: upperAsset, url: upperPreview, ref: upperRef },
            { key: "lower", label: "添加印花", optional: true, item: lowerAsset, url: lowerPreview, ref: lowerRef },
          ] : isModelFaceSwap ? [
            { key: "model", label: "添加模特", optional: false, item: asset, url: preview, ref: inputRef },
            { key: "upper", label: "添加人脸", optional: false, item: upperAsset, url: upperPreview, ref: upperRef },
          ] : isFaceFusion ? [
            { key: "model", label: "添加人脸1", optional: false, item: asset, url: preview, ref: inputRef },
            { key: "upper", label: "添加人脸2", optional: false, item: upperAsset, url: upperPreview, ref: upperRef },
          ] : isPersonInScene ? [
            { key: "model", label: "添加模特", optional: false, item: asset, url: preview, ref: inputRef },
            { key: "upper", label: "添加背景", optional: false, item: upperAsset, url: upperPreview, ref: upperRef },
          ] : [
            { key: "model", label: isFaceThreeView ? "添加人脸" : isPersonFourView || isPersonRealism ? "添加模特" : isImageRetouche ? "添加产品" : "添加商品", optional: false, item: asset, url: preview, ref: inputRef },
          ]).map((slot) => <div className={slot.item ? "has-asset" : ""} key={slot.key}><button disabled={busy} onClick={() => slot.ref.current?.click()} type="button">{slot.url ? <img alt={`${slot.label}缩略图`} src={slot.url} /> : <ImagePlus />}<strong>{slot.item?.name ?? slot.label}</strong>{slot.optional && <small>可选</small>}</button><button className="try-on-library-button" disabled={busy} onClick={() => setPickerTarget(slot.key as "model" | "upper" | "lower")} type="button"><FolderOpen />资产库</button></div>)}</div> : <><button
            className={`image-panel-input ${asset ? "has-file" : ""}`}
            disabled={!selected.ready || busy}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {busy ? <LoaderCircle className="spin" /> : preview ? <img alt="商品图预览" src={preview} /> : <ImagePlus />}
            <strong>{asset?.name ?? selected.input}</strong>
            <small>{selected.ready ? "PNG / JPG / JPEG / WebP · 单张最大 20MB" : "该能力将在后续接入"}</small>
            {asset && (
              <span onClick={(event) => { event.stopPropagation(); resetPanel(); }} role="button">
                <X />
              </span>
            )}
          </button><button className="image-panel-library" disabled={!selected.ready || busy} onClick={() => setPickerTarget("model")} type="button">
            <FolderOpen aria-hidden="true" />
            从资产库选择
            <small>使用已上传或 AI 生成的图片</small>
          </button></>}
          <input accept="image/jpeg,image/png,image/webp" hidden onChange={chooseImage} ref={inputRef} type="file" />
          <input accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void chooseTryOnImage("upper", event)} ref={upperRef} type="file" />
          <input accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void chooseTryOnImage("lower", event)} ref={lowerRef} type="file" />
          <label className={usesCompactUpload ? "try-on-description-label" : undefined}>补充说明 <em>· 选填</em><span>{instructions.length} / 2000</span></label>
          <textarea
            className={usesCompactUpload ? "try-on-description" : undefined}
            disabled={!selected.ready}
            maxLength={2000}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder={isTryOn ? "可补充模特姿势、动作、穿搭效果、场景氛围等，例如：自然站立、双手插兜、衣服更宽松一些…" : isProductUse ? "可补充商品使用动作、场景和构图，例如：人物在浴室镜前自然使用产品，商品正面朝向镜头…" : isClothingRedesign ? "可补充面料描述和印花位置，例如：替换为哑光羊毛面料，将印花放在胸前中央并保持完整…" : isWhiteBackground ? "可补充拍摄角度和需要保留的细节，例如：正面略俯拍、保留包装文字与金属反光、商品居中并留出均匀边距…" : isFaceThreeView ? "可补充角色气质、表情和写实程度，例如：自然微笑、清冷气质、写实摄影风格…" : isPersonFourView ? "可补充穿搭与人物气质，例如：保持原穿搭、自然站姿、写实模特档案风格…" : isModelFaceSwap ? "可补充表情、妆容和发型细节，例如：自然微笑、淡妆、保留刘海…" : isFaceFusion ? "可补充融合比例、年龄感、气质和表情，例如：更偏向人脸1、约25岁、清冷感、自然微笑…" : isPersonInScene ? "可补充人物姿势、位置和构图，例如：人物自然站在窗边、位于画面右侧、保留全身…" : isPersonRealism ? "可说明需要加强的脸部、手部、发丝或光影，例如：保留淡妆，增加自然皮肤纹理和柔和环境光…" : isImageRetouche ? "可补充需要精修的内容，比如痘痕、美颜、清晰度、色彩、商品材质或局部瑕疵…" : "可补充细节要求、风格、构图和需保留的元素…"}
            value={instructions}
          />
          {notice && <p className="suite-error" role="alert">{notice}</p>}
          {(isTryOn || isModelFaceSwap || isFaceFusion || isPersonInScene || isPersonRealism) && <label className="try-on-consent"><input checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} type="checkbox" /><span>我确认已获得人物肖像及上传素材的合法使用授权。</span></label>}
          <hr />
          <label>模型与图片设置</label>
          <div className="image-panel-model">
            <span>国产 AI 图片模型</span>
            {selected.ready ? <select aria-label="图片模型" onChange={(event) => setModel(event.target.value)} value={model}><option value="seedream-image-flash">Seedream 5.0 Flash</option><option value="doubao-seedream-4-0-20260415">Doubao Seedream 4.0</option></select> : <strong>待接入</strong>}
          </div>
          {selected.ready && (
            <div className="image-inline-settings">
              <label>
                分辨率
                <select value={resolution} onChange={(event) => setResolution(event.target.value)}>
                  <option>1K</option>
                  <option>2K</option>
                </select>
              </label>
              <label>
                格式
                <select value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option>PNG</option>
                  <option>JPG</option>
                </select>
              </label>
            </div>
          )}
          <button className="image-panel-action" disabled={!selected.ready || !asset || busy || ((isTryOn || isProductUse || isModelFaceSwap || isFaceFusion || isPersonInScene) && !upperAsset) || ((isTryOn || isModelFaceSwap || isFaceFusion || isPersonInScene || isPersonRealism) && !authorizationConfirmed)} onClick={generate} type="button">
            {!selected.ready ? "该能力开发中" : busy ? "正在提交…" : `立即生成${selected.title}`}
            {selected.ready && <span>预计 {isTryOn ? (resolution === "2K" ? 40 : 20) : isProductUse || isClothingRedesign || isModelFaceSwap || isFaceFusion || isPersonInScene ? (resolution === "2K" ? 30 : 15) : (resolution === "2K" ? 20 : 10)} 积分</span>}
          </button>
          <footer>
            <span>HISTORY · 生成记录</span>
            <span>{recentTasks.length} / 40</span>
            <button onClick={() => router.push("/tasks")} type="button">查看全部</button>
          </footer>
          <section className={`image-recent-tasks ${recentTasks.length ? "" : "empty"}`}>{recentTasks.length ? recentTasks.map((task) => <button key={task.id} onClick={() => router.push("/tasks")} type="button">{recentPreviewUrls[task.id] ? <img alt="最近生成结果" src={recentPreviewUrls[task.id]} /> : <span className={`recent-task-state ${task.status.toLowerCase()}`}>{task.status === "SUCCEEDED" ? "完成" : task.status === "FAILED" ? "失败" : task.status === "RUNNING" ? `${task.progress}%` : "排队"}</span>}<span><strong>{task.status === "SUCCEEDED" ? "生成成功" : task.status === "FAILED" ? "生成失败" : task.status === "RUNNING" ? "生成中" : "等待生成"}</strong><small>{new Date(task.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></span></button>) : <div><strong>暂无生成记录</strong><small>提交任务后在此跟踪进度</small></div>}</section>
        </div>
      </aside>
      <AssetPickerModal onClose={() => setPickerTarget(null)} onConfirm={applyPickedAsset} open={pickerTarget !== null} />
      {templateOpen && <div className="picker-overlay" onMouseDown={() => setTemplateOpen(false)} role="presentation"><section className="try-on-template-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><header><div><span>TEMPLATES · {selected.title}</span><h2>选择图片模板</h2></div><button aria-label="关闭模板弹窗" onClick={() => setTemplateOpen(false)} type="button"><X /></button></header><div><ImagePlus /><strong>模板图片位置已预留</strong><p>收到模板图片后，将在这里展示并支持单选应用。</p></div><footer><button className="secondary-action" onClick={() => setTemplateOpen(false)} type="button">关闭</button></footer></section></div>}
      <ImageResultModal errorMessage={previewTask?.errorMessage ?? null} inputUrl={preview} onAdjust={() => { setPreviewTask(null); setResultUrls([]); }} onClose={() => setPreviewTask(null)} onViewTasks={() => router.push("/tasks")} open={previewTask !== null} progress={previewTask?.progress ?? 0} resultUrls={resultUrls} status={previewTask?.status ?? "QUEUED"} title={selected.title} />
    </div>
  );
}

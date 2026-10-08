"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileAudio, FileVideo, FolderOpen, Image as ImageIcon, LoaderCircle, Play, Sparkles, UploadCloud, X } from "lucide-react";
import { StudioSidebar } from "../../../components/studio-sidebar";
import { AssetPickerModal } from "../../../components/asset-picker-modal";
import { DirectorChat } from "../../../components/director-chat";
import { apiRequest, ApiError, type Asset, hasSession, uploadAsset } from "../../../lib/api";
import { FALLBACK_GENERATION_DEFAULTS, VIDEO_RECREATION_LIMITS, type CapabilityDefaults, type PlatformCatalog } from "../../../lib/generation-defaults";

const capabilities = {
  "video-recreation": { title: "深度复刻", eyebrow: "VIDEO RECREATION", description: "上传参考视频与商品素材，复刻创意结构、镜头语言和节奏。" },
  "product-detail-set": { title: "商详套图", eyebrow: "PRODUCT DETAIL SET", description: "围绕商品卖点规划并生成风格统一的详情页套图。" },
  "ecommerce-video": { title: "电商带货", eyebrow: "ECOMMERCE VIDEO", description: "配置商品与营销素材，快速创建电商带货视频。" },
  director: { title: "超级编导", eyebrow: "AI DIRECTOR", description: "从创意、脚本和分镜开始组织完整的视频生产流程。" },
  "virtual-try-on": { title: "服装上身", eyebrow: "VIRTUAL TRY-ON", description: "上传服装和人物素材，生成自然的模特上身效果。" },
  "local-store": { title: "同城到店", eyebrow: "LOCAL STORE VIDEO", description: "结合门店、招牌和产品素材，创建本地探店推广视频。" },
  "brand-ad": { title: "品牌广告", eyebrow: "BRAND ADVERTISING", description: "围绕品牌主张与创意概念创建质感广告内容。" },
  "product-white-background": { title: "商品白底图", eyebrow: "PRODUCT CUTOUT", description: "生成适合商品上架的干净白底视觉。" },
  "image-retouche": { title: "图片精修", eyebrow: "IMAGE RETOUCHE", description: "增强商品图片质感并保留关键细节。" },
  "face-three-view": { title: "脸部三视图", eyebrow: "FACE THREE VIEW", description: "生成正脸、侧脸和半侧脸的人物参考。" },
  "person-four-view": { title: "人物四视图", eyebrow: "PERSON FOUR VIEW", description: "生成全身三视角与脸部特写。" },
  "model-face-swap": { title: "模特换脸", eyebrow: "MODEL FACE SWAP", description: "将参考人脸与发型应用到模特图。" },
  "face-fusion": { title: "人脸融合", eyebrow: "FACE FUSION", description: "融合两张人脸，创建新的虚拟形象资产。" },
  "product-use": { title: "商品使用", eyebrow: "PRODUCT IN USE", description: "生成真人试用与商品使用场景。" },
  "clothing-redesign": { title: "服装改款", eyebrow: "CLOTHING REDESIGN", description: "替换服装的面料、印花与图案。" },
  "person-in-scene": { title: "人物入景", eyebrow: "PERSON IN SCENE", description: "将人物自然融入指定的环境与光影。" },
  "person-realism": { title: "人物真人感", eyebrow: "PERSON REALISM", description: "优化 AI 人物的皮肤、头发与光影质感。" },
} as const;

type CapabilityKey = keyof typeof capabilities;

function useNewCreationReset(reset: () => void) {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".suite-panel > header button")).find((item) => item.textContent?.includes("新建"));
    if (!button) return;
    const handle = () => resetRef.current();
    button.addEventListener("click", handle);
    return () => button.removeEventListener("click", handle);
  }, []);
}

export default function CreationPage() {
  const router = useRouter();
  const params = useParams<{ capability: string }>();
  const [ready, setReady] = useState(false);
  const [transferredAssets, setTransferredAssets] = useState<Array<Pick<Asset, "id" | "name" | "kind">>>([]);
  const key = params.capability as CapabilityKey;
  const capability = capabilities[key];

  useEffect(() => {
    if (key === "image-retouche") {
      router.replace("/image?tool=image-retouche");
      return;
    }
    const loginUrl = `/auth?next=${encodeURIComponent(`/create/${params.capability}`)}`;
    if (!hasSession()) return void router.replace(loginUrl);
    apiRequest("/auth/me").then(() => setReady(true)).catch(() => router.replace(loginUrl));
  }, [params.capability, router]);

  useEffect(() => {
    if (key !== "product-detail-set") return;
    try {
      const transfer = JSON.parse(sessionStorage.getItem("agent_transfer") ?? "null") as { assets?: Array<Pick<Asset, "id" | "name" | "kind">>; targetPath?: string; createdAt?: number } | null;
      sessionStorage.removeItem("agent_transfer");
      const isFreshTransfer = transfer?.targetPath === `/create/${key}`
        && typeof transfer.createdAt === "number"
        && Date.now() - transfer.createdAt < 30_000;
      if (isFreshTransfer) setTransferredAssets(transfer.assets?.filter((asset) => asset.kind === "IMAGE") ?? []);
    } catch { sessionStorage.removeItem("agent_transfer"); }
  }, [key]);

  if (!capability) return <main className="route-message"><h1>创作目标不存在</h1><button onClick={() => router.replace("/")} type="button">返回首页</button></main>;
  if (!ready) return <main className="route-message"><p>{key === "image-retouche" ? "正在打开图片精修…" : "正在检查登录状态…"}</p></main>;
  if (key === "product-detail-set") return <ProductDetailSuite initialAssets={transferredAssets} />;
  if (key === "video-recreation") return <VideoStudio mode="recreate" />;
  if (key === "ecommerce-video") return <VideoStudio mode="director" />;
  if (key === "product-white-background") return <WhiteBackgroundStudio />;
  if (key === "virtual-try-on") return <VirtualTryOnStudio />;

  return (
    <div className="studio-shell">
      <StudioSidebar />
      <main className="workspace creation-workspace">
        <header className="creation-header"><div><p className="product-kicker">{capability.eyebrow}</p><h1>{capability.title}</h1><p>{capability.description}</p></div><button className="secondary-action" onClick={() => router.push("/")} type="button">返回目标选择</button></header>
        <section className="capability-empty"><UploadCloud aria-hidden="true" /><h2>添加创作素材</h2><p>该创作目标的详细工作流将按照 PRD 对应功能逐步接入。</p><button className="primary-action" onClick={() => router.push("/assets")} type="button">从资产库选择</button></section>
      </main>
    </div>
  );
}

type TryOnSlot = "model" | "upper" | "lower";

function VirtualTryOnStudio() {
  const router = useRouter();
  const modelRef = useRef<HTMLInputElement>(null);
  const upperRef = useRef<HTMLInputElement>(null);
  const lowerRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef<Partial<Record<TryOnSlot, string>>>({});
  const [assets, setAssets] = useState<Partial<Record<TryOnSlot, SuiteAsset>>>({});
  const [previews, setPreviews] = useState<Partial<Record<TryOnSlot, string>>>({});
  const [pickerSlot, setPickerSlot] = useState<TryOnSlot | null>(null);
  const [instructions, setInstructions] = useState("");
  const [resolution, setResolution] = useState("1K");
  const [format, setFormat] = useState("PNG");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [defaultConfig, setDefaultConfig] = useState<CapabilityDefaults>({ model: "seedream-image-flash", ratio: "1:1", resolution: "1K", format: "PNG", count: 1 });

  useEffect(() => {
    void apiRequest<PlatformCatalog>("/platform/catalog").then((catalog) => {
      const defaults = catalog.defaults.virtual_try_on;
      if (!defaults) return;
      setDefaultConfig(defaults); setResolution(defaults.resolution); setFormat(defaults.format);
    }).catch(() => undefined);
  }, []);

  function clearPreviews() {
    Object.values(previews).forEach((url) => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); });
  }

  function reset() {
    clearPreviews(); setAssets({}); setPreviews({}); setInstructions(""); setResolution(defaultConfig.resolution); setFormat(defaultConfig.format); setAuthorizationConfirmed(false); setNotice("");
  }

  useNewCreationReset(reset);
  useEffect(() => { previewsRef.current = previews; }, [previews]);
  useEffect(() => () => { Object.values(previewsRef.current).forEach((url) => { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); }); }, []);

  async function chooseImage(slot: TryOnSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void setNotice("仅支持 PNG、JPG、JPEG、WebP 图片");
    if (file.size > 20 * 1024 * 1024) return void setNotice("图片不能超过 20MB");
    setBusy(true); setNotice("");
    try {
      const uploaded = await uploadAsset(file);
      const previous = previews[slot]; if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
      setAssets((current) => ({ ...current, [slot]: uploaded }));
      setPreviews((current) => ({ ...current, [slot]: URL.createObjectURL(file) }));
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "图片上传失败"); }
    finally { setBusy(false); }
  }

  function applyPickedAsset(selected: Asset, url: string) {
    if (!pickerSlot) return;
    const previous = previews[pickerSlot]; if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
    setAssets((current) => ({ ...current, [pickerSlot]: selected }));
    setPreviews((current) => ({ ...current, [pickerSlot]: url }));
    setPickerSlot(null); setNotice("");
  }

  async function submit() {
    if (!assets.model || !assets.upper || !authorizationConfirmed || busy) return;
    setBusy(true); setNotice("");
    try {
      await apiRequest("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), capability: "virtual_try_on", assetIds: [assets.model.id, assets.upper.id, ...(assets.lower ? [assets.lower.id] : [])],
        prompt: instructions,
        parameters: { model: defaultConfig.model, ratio: "1:1", resolution, format, count: 1, authorizationConfirmed: true },
      }) });
      router.push("/tasks");
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "服装上身任务提交失败"); }
    finally { setBusy(false); }
  }

  const slots: Array<{ id: TryOnSlot; title: string; help: string; required: boolean; ref: typeof modelRef }> = [
    { id: "model", title: "模特图", help: "正面或全身清晰人物图", required: true, ref: modelRef },
    { id: "upper", title: "服装图", help: "平铺或人台展示的上装/连衣裙", required: true, ref: upperRef },
    { id: "lower", title: "下装图", help: "裤装或裙装，可选", required: false, ref: lowerRef },
  ];
  const estimatedCredits = resolution === "2K" ? 40 : 20;

  return <div className="studio-shell suite-shell try-on-studio"><StudioSidebar /><main className="suite-main"><header className="suite-header"><p className="product-kicker">AI IMAGE · 图片创作</p><div className="suite-header-title"><h1>服装上身</h1><nav><button className="selected" type="button">服装上身 <small>自然试穿效果</small></button><button onClick={() => router.push("/image")} type="button">图片创作 <small>更多一键技能</small></button></nav></div></header>
    <section className="suite-intro"><Sparkles aria-hidden="true" /><p>上传模特和服装参考，AI 将保留人物身份、姿势和场景，生成<strong>版型、面料与图案细节一致</strong>的自然上身效果。</p></section>
    <section className="try-on-flow"><div className="suite-section-title"><span>INPUT · 素材组合</span><h2>模特与服装参考</h2></div><div>{slots.map((slot) => <article key={slot.id}>{previews[slot.id] ? <img alt={`${slot.title}预览`} src={previews[slot.id]} /> : <span><ImageIcon /></span>}<strong>{slot.title}{slot.required ? " · 必填" : " · 选填"}</strong><small>{assets[slot.id]?.name ?? slot.help}</small></article>)}</div></section>
    <section className="suite-guide"><span>上传建议</span><p><i>1</i>模特身体无遮挡、姿势自然，人物与服装尽量正面展示</p><p><i>2</i>服装图背景简洁，Logo、印花、领口与袖型清晰可见</p><p><i>3</i>生成结果保留强制 AI 标识，使用真人素材前需获得肖像授权</p></section>
  </main><aside className="suite-panel"><header><Sparkles /><strong>服装上身</strong><button onClick={reset} type="button">＋ 新建</button></header><div className="suite-panel-body"><label className="suite-label">输入素材 <em>· 3 项</em></label><div className="try-on-upload-grid">{slots.map((slot) => <div className={assets[slot.id] ? "has-asset" : ""} key={slot.id}><button disabled={busy} onClick={() => slot.ref.current?.click()} type="button">{previews[slot.id] ? <img alt={`${slot.title}缩略图`} src={previews[slot.id]} /> : <ImageIcon />}<strong>{assets[slot.id]?.name ?? (slot.id === "model" ? "添加模特" : slot.id === "upper" ? "添加上身/全身装" : "添加下装")}</strong>{!slot.required && <small>可选</small>}</button><button className="try-on-library-button" disabled={busy} onClick={() => setPickerSlot(slot.id)} type="button"><FolderOpen />资产库</button><input accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void chooseImage(slot.id, event)} ref={slot.ref} type="file" /></div>)}</div>
    {notice && <p className="suite-error" role="alert">{notice}</p>}<label className="suite-label material-heading">补充说明 <em>· 选填</em><span>{instructions.length} / 1000</span></label><textarea className="suite-textarea" maxLength={1000} onChange={(event) => setInstructions(event.target.value)} placeholder="例如：自然站姿、衣摆垂顺、保留胸前刺绣、米白色摄影棚背景…" value={instructions} />
    <div className="suite-divider" /><label className="suite-label">输出设置</label><div className="suite-config-grid"><label>分辨率<select onChange={(event) => setResolution(event.target.value)} value={resolution}><option>1K</option><option>2K</option></select></label><label>格式<select onChange={(event) => setFormat(event.target.value)} value={format}><option>PNG</option><option>JPG</option></select></label></div><label className="try-on-consent"><input checked={authorizationConfirmed} onChange={(event) => setAuthorizationConfirmed(event.target.checked)} type="checkbox" /><span>我确认已获得模特肖像及上传素材的合法使用授权，并同意结果添加 AI 生成标识。</span></label><button className="suite-generate" disabled={!assets.model || !assets.upper || !authorizationConfirmed || busy} onClick={submit} type="button">{busy ? "正在提交…" : "生成上身效果"}<span>预计 {estimatedCredits} 积分</span></button><div className="suite-history"><div><span>HISTORY · 生成记录</span><small>最多 40 条</small></div><section>结果将在任务历史与资产库中展示</section></div></div></aside>
    <AssetPickerModal open={pickerSlot !== null} onClose={() => setPickerSlot(null)} onConfirm={applyPickedAsset} />
  </div>;
}

const retouchePresets = [
  { id: "smart", label: "智能精修", description: "自动平衡清晰度、光影与质感", prompt: "智能分析画面并进行自然精修：提升清晰度与细节，优化曝光、白平衡、色彩和光影，去除轻微噪点与瑕疵。" },
  { id: "product", label: "商品质感", description: "强化材质、纹理与商业光影", prompt: "进行电商商品精修：增强材质纹理、边缘细节和商业棚拍光影，校正色彩，但必须保持商品结构、颜色、文字、商标和包装完全一致。" },
  { id: "portrait", label: "人像自然美化", description: "自然肤质、发丝与五官细节", prompt: "进行自然人像精修：轻度优化肤色与肤质，增强眼神、发丝和服装细节，修复手部等轻微瑕疵；保留身份特征、脸型和真实皮肤纹理，禁止过度磨皮。" },
] as const;

function ImageRetoucheStudio() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [asset, setAsset] = useState<SuiteAsset | null>(null);
  const [preview, setPreview] = useState("");
  const [preset, setPreset] = useState<(typeof retouchePresets)[number]["id"]>("smart");
  const [instructions, setInstructions] = useState("");
  const [resolution, setResolution] = useState("1K");
  const [format, setFormat] = useState("PNG");
  const [model, setModel] = useState("seedream-image-flash");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [defaultConfig, setDefaultConfig] = useState<CapabilityDefaults>({ model: "seedream-image-flash", ratio: "1:1", resolution: "1K", format: "PNG", count: 1 });

  useEffect(() => {
    void apiRequest<PlatformCatalog>("/platform/catalog").then((catalog) => {
      const defaults = catalog.defaults.image_retouche;
      if (!defaults) return;
      setDefaultConfig(defaults); setModel(defaults.model); setResolution(defaults.resolution); setFormat(defaults.format);
    }).catch(() => undefined);
  }, []);

  function replacePreview(next: string) {
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(next);
  }

  function reset() {
    replacePreview(""); setAsset(null); setPreset("smart"); setInstructions(""); setResolution(defaultConfig.resolution); setFormat(defaultConfig.format); setModel(defaultConfig.model); setNotice("");
  }

  useNewCreationReset(reset);
  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void setNotice("仅支持 PNG、JPG、JPEG、WebP 图片");
    if (file.size > 20 * 1024 * 1024) return void setNotice("图片不能超过 20MB");
    setBusy(true); setNotice("");
    try {
      const uploaded = await uploadAsset(file);
      replacePreview(URL.createObjectURL(file));
      setAsset(uploaded);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "图片上传失败"); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!asset || busy) return;
    const selected = retouchePresets.find((item) => item.id === preset) ?? retouchePresets[0];
    setBusy(true); setNotice("");
    try {
      await apiRequest("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), capability: "image_retouche", assetIds: [asset.id],
        prompt: `${selected.prompt}${instructions.trim() ? `\n用户补充要求：${instructions.trim()}` : ""}`,
        parameters: { model, ratio: "1:1", resolution, format, count: 1 },
      }) });
      router.push("/tasks");
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "精修任务提交失败"); }
    finally { setBusy(false); }
  }

  const estimatedCredits = resolution === "2K" ? 20 : 10;
  return <div className="studio-shell suite-shell retouche-studio"><StudioSidebar /><main className="suite-main"><header className="suite-header"><p className="product-kicker">AI IMAGE · 图片创作</p><div className="suite-header-title"><h1>图片精修</h1><nav><button onClick={() => router.push("/create/product-white-background")} type="button">商品白底图 <small>电商上架标准图</small></button><button className="selected" type="button">图片精修 <small>清晰度与质感增强</small></button></nav></div></header>
    <section className="suite-intro"><Sparkles aria-hidden="true" /><p>在不改变商品与人物身份特征的前提下，改善<strong>清晰度、色彩、光影和局部瑕疵</strong>；原图会完整保留，精修结果作为新资产保存。</p></section>
    <section className="white-bg-preview retouche-preview"><div className="suite-section-title"><span>COMPARE · 前后对比</span><h2>原图与精修结果</h2></div><div className="white-preview-grid"><article>{preview ? <img alt="待精修原图" src={preview} /> : <div><ImageIcon /><span>上传或从资产库选择原图</span></div>}<strong>原始图片 · 不会被覆盖</strong></article><article><div className="output-placeholder"><Sparkles /><span>{resolution} · {format} · 生成后可在任务历史对比</span></div><strong>AI 精修结果 · 保存为新资产</strong></article></div></section>
    <section className="suite-guide"><span>精修原则</span><p><i>1</i>保留商品结构、包装文字、Logo 与人物身份特征</p><p><i>2</i>智能优化清晰度、曝光、色彩、材质与自然瑕疵</p><p><i>3</i>任务完成后可在历史页查看原图与结果并下载</p></section>
  </main><aside className="suite-panel"><header><Sparkles /><strong>图片精修</strong><button onClick={reset} type="button">＋ 新建</button></header><div className="suite-panel-body"><label className="suite-label">原始图片 <em>· 必填</em></label><div className="suite-source-actions"><button className="suite-upload" disabled={busy} onClick={() => inputRef.current?.click()} type="button">{busy ? <LoaderCircle className="spin" /> : <UploadCloud />}{asset?.name ?? "本地上传"}</button><button className="suite-upload library" disabled={busy} onClick={() => setPickerOpen(true)} type="button"><FolderOpen />资产库</button></div><input accept="image/jpeg,image/png,image/webp" hidden onChange={chooseImage} ref={inputRef} type="file" /><small className="field-help">PNG / JPG / WebP · 最大 20MB</small>
    {notice && <p className="suite-error" role="alert">{notice}</p>}<div className="suite-divider" /><label className="suite-label">精修模式</label><div className="retouche-presets">{retouchePresets.map((item) => <button className={preset === item.id ? "selected" : ""} key={item.id} onClick={() => setPreset(item.id)} type="button"><strong>{item.label}</strong><small>{item.description}</small></button>)}</div><label className="suite-label material-heading">自定义要求 <em>· 选填</em><span>{instructions.length} / 1000</span></label><textarea className="suite-textarea" maxLength={1000} onChange={(event) => setInstructions(event.target.value)} placeholder="例如：轻微瘦脸、去除背景划痕、提升金属光泽，但保留包装文字…" value={instructions} />
    <div className="suite-divider" /><label className="suite-label">模型</label><select onChange={(event) => setModel(event.target.value)} value={model}><option value="seedream-image-flash">豆包 Seedream 5.0 Flash · 已接入</option></select><div className="suite-config-grid"><label>分辨率<select onChange={(event) => setResolution(event.target.value)} value={resolution}><option>1K</option><option>2K</option></select></label><label>格式<select onChange={(event) => setFormat(event.target.value)} value={format}><option>PNG</option><option>JPG</option></select></label></div><button className="suite-generate" disabled={!asset || busy} onClick={submit} type="button">{busy ? "正在提交…" : "开始精修"}<span>预计 {estimatedCredits} 积分</span></button><div className="suite-history"><div><span>HISTORY · 生成记录</span><small>最多 40 条</small></div><section>结果将在任务历史与资产库中展示</section></div></div></aside>
    <AssetPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onConfirm={(selected, url) => { setAsset({ id: selected.id, name: selected.name, kind: selected.kind }); replacePreview(url); setPickerOpen(false); setNotice(""); }} />
  </div>;
}

function WhiteBackgroundStudio() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [asset, setAsset] = useState<SuiteAsset | null>(null);
  const [preview, setPreview] = useState("");
  const [resolution, setResolution] = useState("1K");
  const [format, setFormat] = useState("PNG");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [defaultConfig, setDefaultConfig] = useState<CapabilityDefaults>({ model: FALLBACK_GENERATION_DEFAULTS.imageModel, ratio: "1:1", resolution: FALLBACK_GENERATION_DEFAULTS.imageResolution, format: FALLBACK_GENERATION_DEFAULTS.imageFormat, count: 1 });

  useEffect(() => {
    void apiRequest<PlatformCatalog>("/platform/catalog").then((catalog) => {
      const defaults = catalog.defaults.product_white_background;
      if (!defaults) return;
      setDefaultConfig(defaults); setResolution(defaults.resolution); setFormat(defaults.format);
    }).catch(() => undefined);
  }, []);

  useNewCreationReset(() => {
    if (preview) URL.revokeObjectURL(preview);
    setAsset(null); setPreview(""); setResolution(defaultConfig.resolution); setFormat(defaultConfig.format); setNotice("");
  });

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void setNotice("仅支持 PNG、JPG、JPEG、WebP 图片");
    if (file.size > 20 * 1024 * 1024) return void setNotice("图片不能超过 20MB");
    setBusy(true); setNotice("");
    try {
      const uploaded = await uploadAsset(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      setAsset(uploaded);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "商品图上传失败"); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!asset || busy) return;
    setBusy(true); setNotice("");
    try {
      await apiRequest("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), capability: "product_white_background", assetIds: [asset.id],
        prompt: "商品居中，纯白背景，保持原始比例与细节",
        parameters: { model: "seedream-image-flash", ratio: "1:1", resolution, format, count: 1 },
      }) });
      router.push("/tasks");
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "任务提交失败"); }
    finally { setBusy(false); }
  }

  return <div className="studio-shell suite-shell white-bg-studio"><StudioSidebar /><main className="suite-main"><header className="suite-header"><p className="product-kicker">AI IMAGE · 图片创作</p><div className="suite-header-title"><h1>商品白底图</h1><nav><button className="selected" type="button">商品白底图 <small>电商上架标准图</small></button><button onClick={() => router.push("/image?tool=image-retouche")} type="button">图片精修 <small>清晰度与质感增强</small></button></nav></div></header>
    <section className="suite-intro"><Sparkles aria-hidden="true" /><p>上传商品图，生成<strong>纯白背景、居中构图、统一尺寸</strong>的电商上架图，结果自动保存到资产库。</p></section>
    <section className="white-bg-preview"><div className="suite-section-title"><span>PREVIEW · 处理预览</span><h2>原图与输出规格</h2></div><div className="white-preview-grid"><article>{preview ? <img alt="已上传商品原图" src={preview} /> : <div><ImageIcon /><span>请在右侧上传商品原图</span></div>}<strong>商品原图</strong></article><article><div className="output-placeholder"><Sparkles /><span>{resolution} · {format} · 1:1</span></div><strong>生成后自动进入资产库</strong></article></div></section>
    <section className="suite-guide"><span>处理说明</span><p><i>1</i>建议上传边界清晰的 PNG/JPG/WebP 商品图</p><p><i>2</i>当前本地版支持透明底转白底、居中与尺寸标准化</p><p><i>3</i>复杂背景的 AI 抠图将在国产视觉模型接入后启用</p></section>
  </main><aside className="suite-panel"><header><Sparkles /><strong>白底图生成</strong><button onClick={() => { setAsset(null); setPreview(""); setNotice(""); }} type="button">＋ 新建</button></header><div className="suite-panel-body"><label className="suite-label">商品图 <em>· 必填</em></label><button className="suite-upload" disabled={busy} onClick={() => inputRef.current?.click()} type="button">{busy ? <LoaderCircle className="spin" /> : <UploadCloud />}{asset?.name ?? "上传商品图"}</button><input accept="image/jpeg,image/png,image/webp" hidden onChange={chooseImage} ref={inputRef} type="file" /><small className="field-help">PNG / JPG / WebP · 最大 20MB</small>
    {notice && <p className="suite-error" role="alert">{notice}</p>}<div className="suite-divider" /><label className="suite-label">输出设置</label><div className="suite-config-grid"><label>分辨率<select onChange={(event) => setResolution(event.target.value)} value={resolution}><option>1K</option><option>2K</option></select></label><label>格式<select onChange={(event) => setFormat(event.target.value)} value={format}><option>PNG</option><option>JPG</option></select></label></div><div className="white-spec"><span>背景</span><strong>#FFFFFF 纯白</strong><span>比例</span><strong>1:1</strong></div><button className="suite-generate" disabled={!asset || busy} onClick={submit} type="button">{busy ? "正在处理…" : "立即生成白底图"}<span>预计 {resolution === "2K" ? 20 : 10} 积分</span></button><div className="suite-history"><div><span>HISTORY · 生成记录</span><small>最多 40 条</small></div><section>生成结果可在任务历史与资产库查看</section></div></div></aside></div>;
}

function VideoStudio({ mode }: { mode: "recreate" | "director" }) {
  const router = useRouter();
  const referenceRef = useRef<HTMLInputElement>(null);
  const materialRef = useRef<HTMLInputElement>(null);
  const directorImageRef = useRef<HTMLInputElement>(null);
  const directorAudioRef = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState<SuiteAsset | null>(null);
  const [materials, setMaterials] = useState<SuiteAsset[]>([]);
  const [directorImage, setDirectorImage] = useState<SuiteAsset | null>(null);
  const [directorAudio, setDirectorAudio] = useState<SuiteAsset | null>(null);
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("电商带货");
  const [template, setTemplate] = useState("口播带货");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState("5s");
  const [model, setModel] = useState("doubao-seedance-1-0-pro-fast-251015");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [subscriptionTier, setSubscriptionTier] = useState("FREE");
  const [defaultConfig, setDefaultConfig] = useState<CapabilityDefaults>({ model: FALLBACK_GENERATION_DEFAULTS.videoModel, ratio: FALLBACK_GENERATION_DEFAULTS.videoRatio, resolution: FALLBACK_GENERATION_DEFAULTS.videoResolution, duration: FALLBACK_GENERATION_DEFAULTS.videoDuration, format: "MP4", count: 1 });
  const [phase, setPhase] = useState<"input" | "script" | "final">("input");
  const [script, setScript] = useState("");
  const [scriptBusy, setScriptBusy] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");

  useEffect(() => {
    if (mode !== "director") return;
    const requestedCategory = new URLSearchParams(window.location.search).get("category");
    const defaultTemplates: Record<string, string> = {
      "电商带货": "口播带货",
      "同城到店": "门店发现",
      "剧情短片": "对话短剧",
      "品牌广告": "品牌主张",
    };
    if (!requestedCategory || !defaultTemplates[requestedCategory]) return;
    setCategory(requestedCategory);
    setTemplate(defaultTemplates[requestedCategory]);
  }, [mode]);

  useEffect(() => {
    void apiRequest<PlatformCatalog>("/platform/catalog").then((catalog) => {
      const defaults = catalog.defaults[mode === "recreate" ? "video_recreation" : "director_video"];
      if (defaults) {
        setDefaultConfig(defaults); setModel(defaults.model); setRatio(defaults.ratio); setResolution(defaults.resolution); setDuration(defaults.duration ?? "15s");
      }
      setSubscriptionTier(catalog.subscription.status === "ACTIVE" ? catalog.subscription.tier : "FREE");
    }).catch(() => undefined);
  }, [mode]);

  useNewCreationReset(() => {
    setReference(null); setMaterials([]); setDirectorImage(null); setDirectorAudio(null); setPrompt(""); setCategory("电商带货"); setTemplate("口播带货"); setNotice("");
    setModel(defaultConfig.model); setRatio(defaultConfig.ratio); setResolution(defaultConfig.resolution); setDuration(defaultConfig.duration ?? "15s");
    setPhase("input"); setScript(""); setScriptBusy(false); setAdjustment(""); setFinalPrompt("");
  });

  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("category");
    const categories = ["电商带货", "同城到店", "剧情短片", "品牌广告"] as const;
    if (preset && (categories as ReadonlyArray<string>).includes(preset)) {
      setCategory(preset);
      setTemplate(preset === "电商带货" ? "口播带货" : preset === "同城到店" ? "门店发现" : preset === "剧情短片" ? "对话短剧" : "品牌主张");
    }
  }, []);

  async function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true); setNotice("");
    try { const asset = await uploadAsset(file); setReference(asset); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "参考视频上传失败"); }
    finally { setBusy(false); }
  }

  async function uploadMaterials(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); event.target.value = "";
    if (materials.length + files.length > 10) return void setNotice("替换素材最多 10 项");
    setBusy(true); setNotice("");
    try { const uploaded = await Promise.all(files.map(uploadAsset)); setMaterials((items) => [...items, ...uploaded]); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "素材上传失败"); }
    finally { setBusy(false); }
  }

  async function uploadDirectorAsset(target: "image" | "audio", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setBusy(true); setNotice("");
    try { const uploaded = await uploadAsset(file); if (target === "image") setDirectorImage(uploaded); else setDirectorAudio(uploaded); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "参考素材上传失败"); }
    finally { setBusy(false); }
  }

  function helpWrite() {
    setPrompt(`请为「${category}」场景创作一条${duration}的${template}视频。\n产品/品牌：\n核心卖点：\n目标人群：\n期望风格：\n行动号召：`);
  }

  function applyLowCostPreset() {
    setModel("doubao-seedance-1-0-pro-fast-251015"); setResolution("480p"); setDuration("4s"); setRatio("1:1");
    setDirectorImage(null); setDirectorAudio(null); setNotice("已应用低成本测试参数：Seedance 1.0 Pro Fast · 480p · 4秒 · 1:1");
  }

  async function generateScript(extraRequirement?: string) {
    if (scriptBusy) return;
    const requirement = [prompt.trim(), extraRequirement?.trim()].filter(Boolean).join("\n");
    setScriptBusy(true); setNotice("");
    try {
      const data = await apiRequest<{ script: string }>("/agent/director/script", { method: "POST", body: JSON.stringify({
        assetIds: [...(directorImage ? [directorImage.id] : []), ...(directorAudio ? [directorAudio.id] : [])], category, template, requirement,
      }) });
      setScript(data.script); setPhase("script");
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "脚本生成失败，请稍后重试"); }
    finally { setScriptBusy(false); }
  }

  const templates = category === "电商带货" ? ["口播带货", "促销转化", "场景种草", "痛点解决", "功能演示"] : category === "同城到店" ? ["门店发现", "到店实录", "招牌体验", "同城团购"] : category === "剧情短片" ? ["对话短剧", "反转短剧", "悬念短剧", "情绪短片", "产品植入"] : ["品牌主张", "品牌故事", "生活方式", "创意概念"];
  const examples = mode === "recreate" ? ["白底图转街拍上身", "室内口播转户外场景", "单模特转多机位展示"] : templates;
  const canSubmit = mode === "recreate" ? Boolean(reference) : Boolean(finalPrompt.trim());
  const estimatedCredits = Math.ceil((mode === "recreate" ? 90 : 60) * (Number.parseInt(duration, 10) / 15) * (resolution === "1080p" ? 2 : resolution === "480p" ? 0.5 : 1));

  async function submitTask() {
    if (!canSubmit || busy) return;
    if (mode === "recreate") {
      const limits = VIDEO_RECREATION_LIMITS[subscriptionTier] ?? VIDEO_RECREATION_LIMITS.FREE!;
      const durations = ["15s", "30s", "60s"];
      const resolutions = ["720p", "1080p"];
      if (durations.indexOf(duration) > durations.indexOf(limits.duration) || resolutions.indexOf(resolution) > resolutions.indexOf(limits.resolution)) {
        setNotice(`当前${limits.label}的复刻上限为 ${limits.duration} / ${limits.resolution}，请升级订阅档位`);
        return;
      }
    }
    setBusy(true); setNotice("");
    try {
      await apiRequest("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        capability: mode === "recreate" ? "video_recreation" : "director_video",
        assetIds: mode === "director" ? [...(directorImage ? [directorImage.id] : []), ...(directorAudio ? [directorAudio.id] : [])] : [...(reference ? [reference.id] : []), ...materials.map((asset) => asset.id)],
        prompt: mode === "director" ? finalPrompt : prompt,
        parameters: { model, ratio, resolution, duration, format: "MP4", count: 1 },
      }) });
      router.push("/tasks");
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "任务提交失败，请稍后重试"); }
    finally { setBusy(false); }
  }

  return <div className="studio-shell suite-shell video-studio"><StudioSidebar /><main className="suite-main"><header className="suite-header"><p className="product-kicker">AI VIDEO · 视频创作</p><div className="suite-header-title"><h1>视频功能</h1><nav><button className={mode === "director" ? "selected" : ""} onClick={() => router.push("/create/ecommerce-video")} type="button">超级编导 <small>从一个想法，到一条完整商业视频</small></button><button className={mode === "recreate" ? "selected" : ""} onClick={() => router.push("/create/video-recreation")} type="button">深度复刻 <small>突破提示词，原视频级精准复刻</small></button></nav></div></header>
    <section className="suite-intro"><Sparkles aria-hidden="true" /><p>{mode === "recreate" ? <>不再依赖文字提示词：上传产品图、模特图、背景图与参考视频，即可生成画面、动作逻辑与内容节奏高度一致的复刻视频。</> : <>让「超级编导」做你的专业导演——理解你的产品、品牌与营销目标，完成创意策划、脚本设计、分镜规划与内容生成。</>}</p></section>
    {mode === "director" && <div className="director-tabs">{["电商带货", "同城到店", "剧情短片", "品牌广告"].map((item) => <button className={category === item ? "selected" : ""} onClick={() => { setCategory(item); setTemplate(item === "电商带货" ? "口播带货" : item === "同城到店" ? "门店发现" : item === "剧情短片" ? "对话短剧" : "品牌主张"); }} type="button" key={item}>{item}<small>{item === "电商带货" ? 5 : item === "剧情短片" ? 5 : 4}</small></button>)}</div>}
    <section className="suite-cases"><div className="suite-section-title"><span>{mode === "recreate" ? "CASES · 复刻效果对比" : "TEMPLATES · 场景模板"}</span><h2>{mode === "recreate" ? "案例对比" : category}</h2></div><div className={mode === "recreate" ? "recreate-examples" : "director-grid"}>{examples.map((item, index) => mode === "recreate" ? <article className="comparison-card" key={item}><strong>案例{index + 1} · {item}</strong><div><figure><span>原视频</span><div className={index % 2 ? "rust" : "blue"}><Play fill="currentColor" /></div></figure><figure><span>复刻视频</span><div className={index % 2 ? "gold" : "mint"}><Play fill="currentColor" /></div></figure></div></article> : <button className={`director-template ${template === item ? "selected" : ""}`} onClick={() => setTemplate(item)} type="button" key={item}><div className={["plum", "blue", "rust", "gold", "mint"][index % 5]}><Play fill="currentColor" /></div><strong>{item}</strong><small>{item === "口播带货" ? "真人推荐，建立购买信任" : item === "促销转化" ? "放大优惠，推动立即下单" : "按模板结构生成专业视频"}</small></button>)}</div></section>
  </main><aside className="suite-panel"><header><Sparkles /><strong>{mode === "recreate" ? "深度复刻" : "视频创作"}</strong><button type="button">＋ 新建</button></header><div className="suite-panel-body">{mode === "recreate" ? <><label className="suite-label">参考视频 <em>· 必填</em></label><button className="suite-upload" disabled={busy} onClick={() => referenceRef.current?.click()} type="button"><FileVideo />{reference?.name ?? "添加参考视频"}</button><input accept="video/mp4,video/quicktime,video/webm" hidden onChange={uploadReference} ref={referenceRef} type="file" /><small className="field-help">MP4 / MOV / WebM · 建议 4–60 秒</small><label className="suite-label material-heading">替换素材 <em>· {materials.length} / 10</em></label><button className="material-picker" disabled={busy || materials.length >= 10} onClick={() => materialRef.current?.click()} type="button">{["产品", "人物", "背景", "声音"].map((item) => <span key={item}>{item}<small>可选</small></span>)}</button><input accept="image/*,audio/*" hidden multiple onChange={uploadMaterials} ref={materialRef} type="file" /></> : <><div className="director-assets"><button disabled={busy} onClick={() => directorImageRef.current?.click()} type="button"><ImageIcon /><span>{directorImage?.name ?? "添加图片"}<small>可选</small></span></button><button disabled={busy} onClick={() => directorAudioRef.current?.click()} type="button"><FileAudio /><span>{directorAudio?.name ?? "添加声音"}<small>可选</small></span></button></div><input accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void uploadDirectorAsset("image", event)} ref={directorImageRef} type="file" /><input accept="audio/mpeg,audio/wav,audio/mp4" hidden onChange={(event) => void uploadDirectorAsset("audio", event)} ref={directorAudioRef} type="file" /><label className="suite-label material-heading">视频提示词 <em>· 使用 @ 指定参考素材</em></label><div className="director-prompt-wrap"><textarea className="suite-textarea director-prompt" maxLength={10000} onChange={(event) => setPrompt(event.target.value)} placeholder="输入视频提示词，使用 @ 指定参考素材，或点击「帮我写」…" value={prompt} /><span>{prompt.length} / 10000</span><button onClick={helpWrite} type="button">帮我写</button><strong><Sparkles />超级编导</strong></div><small className="field-help">当前模板：{template}</small></>}
    {notice && <p className="suite-error">{notice}</p>}<label className="suite-label material-heading">补充说明 <em>· 选填</em><span>{mode === "recreate" ? prompt.length : 0} / {mode === "recreate" ? 4000 : 2000}</span></label>{mode === "recreate" && <textarea className="suite-textarea" maxLength={4000} onChange={(event) => setPrompt(event.target.value)} placeholder="可要求保持画面内容不变、修改商品价格、单价，也可 @ 引用已上传图片…" value={prompt} />}
    <div className="suite-divider" /><label className="suite-label">模型</label><select onChange={(event) => { setModel(event.target.value); if (event.target.value === "doubao-seedance-1-0-pro-fast-251015" && Number.parseInt(duration, 10) > 10) setDuration("5s"); }} value={model}><option value="doubao-seedance-1-0-pro-fast-251015">豆包 Seedance 1.0 Pro Fast</option><option value="doubao-seedance-2-5-260628">豆包 Seedance 2.5（需预留金）</option></select>{mode === "director" && <button className="low-cost-preset" onClick={applyLowCostPreset} type="button">低成本测试 · 480p / 4秒 / 1:1</button>}<div className="video-config"><label>比例<select value={ratio} onChange={(e) => setRatio(e.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option></select></label><label>分辨率<select value={resolution} onChange={(e) => setResolution(e.target.value)}><option>480p</option><option>720p</option><option>1080p</option></select></label><label>时长<select value={duration} onChange={(e) => setDuration(e.target.value)}><option>4s</option><option>5s</option><option>10s</option>{model !== "doubao-seedance-1-0-pro-fast-251015" && <><option>15s</option><option>30s</option></>}</select></label></div><button className="suite-generate" disabled={!canSubmit || busy} onClick={submitTask} type="button">{busy ? "正在提交…" : mode === "recreate" ? "立即生成视频" : "开始编导创作"}<span>预计 {estimatedCredits} 积分</span></button><div className="suite-history"><div><span>HISTORY · 生成记录</span><small>0 / 40</small></div><section>暂无生成记录<small>提交任务后将在此跟踪进度</small></section></div></div></aside></div>;
}

type SuiteAsset = Pick<Asset, "id" | "name" | "kind">;
type SuitePlanItem = { id: string; type: string; instruction: string; referenceIds: string[] };
type LibraryAsset = Asset & { previewUrl: string | undefined };

function ProductDetailSuite({ initialAssets }: { initialAssets: SuiteAsset[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<SuiteAsset[]>(initialAssets.slice(0, 5));
  const [instructions, setInstructions] = useState("");
  const [language, setLanguage] = useState("中文");
  const [mode, setMode] = useState("标准模式");
  const [ratio, setRatio] = useState("1:1");
  const [format, setFormat] = useState("1K · PNG");
  const [count, setCount] = useState(4);
  const [model, setModel] = useState("seedream-image-flash");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [plan, setPlan] = useState<SuitePlanItem[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [defaultConfig, setDefaultConfig] = useState<CapabilityDefaults>({ model: "seedream-image-flash", ratio: "1:1", resolution: "1K", format: "PNG", count: 4 });

  useEffect(() => {
    void apiRequest<PlatformCatalog>("/platform/catalog").then((catalog) => {
      const defaults = catalog.defaults.product_detail_set;
      if (!defaults) return;
      setDefaultConfig(defaults); setModel(defaults.model); setRatio(defaults.ratio); setFormat(`${defaults.resolution} · ${defaults.format}`); setCount(defaults.count);
    }).catch(() => undefined);
  }, []);

  useNewCreationReset(() => {
    setAssets([]); setInstructions(""); setLanguage("中文"); setMode("标准模式"); setRatio(defaultConfig.ratio); setFormat(`${defaultConfig.resolution} · ${defaultConfig.format}`);
    setCount(defaultConfig.count); setModel(defaultConfig.model); setError(""); setShowPlan(false); setPlan([]); setLibraryOpen(false); sessionStorage.removeItem("agent_transfer");
  });

  useEffect(() => setAssets(initialAssets.slice(0, 5)), [initialAssets]);

  async function chooseProducts(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (assets.length + files.length > 5) return void setError("最多 5 张");
    if (!files.length) return;
    const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (files.some((file) => !supportedTypes.has(file.type))) return void setError("仅支持 PNG、JPG、JPEG、WebP 图片");
    if (files.some((file) => file.size > 20 * 1024 * 1024)) return void setError("单张图片不能超过 20MB");
    setUploading(true); setError("");
    try {
      const uploaded = await Promise.all(files.map(uploadAsset));
      setAssets((items) => [...items, ...uploaded.map(({ id, name, kind }) => ({ id, name, kind }))]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "产品图上传失败"); }
    finally { setUploading(false); }
  }

  function planSuite() {
    if (!assets.length) { setError("请先上传 1–5 张产品图"); return; }
    const types = ["主图", "卖点图", "场景图", "功能展示图", "品牌氛围图"];
    setPlan(types.slice(0, count).map((type) => ({ id: crypto.randomUUID(), type, instruction: "", referenceIds: assets.map((asset) => asset.id) })));
    setError(""); setShowPlan(true);
  }

  async function openLibrary() {
    setLibraryOpen(true); setLibraryLoading(true); setLibrarySelection([]); setError("");
    try {
      const response = await apiRequest<{ items: Asset[] }>("/assets?kind=IMAGE&pageSize=50");
      const candidates = response.items.filter((asset) => !assets.some((selected) => selected.id === asset.id));
      const withPreviews = await Promise.all(candidates.map(async (asset) => {
        const result = await apiRequest<{ url: string }>(`/assets/${asset.id}/download-url`).catch(() => null);
        return { ...asset, previewUrl: result?.url };
      }));
      setLibraryAssets(withPreviews);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "资产库加载失败"); setLibraryOpen(false); }
    finally { setLibraryLoading(false); }
  }

  function toggleLibraryAsset(assetId: string) {
    setLibrarySelection((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : current.length >= 5 - assets.length ? current : [...current, assetId]);
  }

  function confirmLibrarySelection() {
    const selected = libraryAssets.filter((asset) => librarySelection.includes(asset.id));
    setAssets((current) => [...current, ...selected.map(({ id, name, kind }) => ({ id, name, kind }))].slice(0, 5));
    setLibraryOpen(false); setLibrarySelection([]);
  }

  function updatePlan(id: string, changes: Partial<SuitePlanItem>) {
    setPlan((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  }

  function movePlan(index: number, direction: -1 | 1) {
    setPlan((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  const resolution = format.startsWith("2K") ? "2K" : "1K";
  const imageFormat = format.endsWith("JPG") ? "JPG" : "PNG";
  const effectiveCount = showPlan ? plan.length : count;
  const estimatedCredits = effectiveCount * 10 * (resolution === "2K" ? 2 : 1);

  async function submitSuite() {
    if (uploading) return;
    setUploading(true); setError("");
    try {
      await apiRequest("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(), capability: "product_detail_set", assetIds: assets.map((asset) => asset.id),
        prompt: `文案语言：${language}；生成模式：${mode}；补充说明：${instructions}\n套图方案JSON：${JSON.stringify(plan.map((item) => ({ type: item.type, instruction: item.instruction, referenceIndexes: item.referenceIds.map((id) => assets.findIndex((asset) => asset.id === id)).filter((index) => index >= 0) })))}`,
        parameters: { model, ratio, resolution, format: imageFormat, count: plan.length },
      }) });
      setShowPlan(false); router.push("/tasks");
    } catch (reason) { setShowPlan(false); setError(reason instanceof ApiError ? reason.message : "任务提交失败，请稍后重试"); }
    finally { setUploading(false); }
  }

  return <div className="studio-shell suite-shell"><StudioSidebar /><main className="suite-main"><header className="suite-header"><p className="product-kicker">AI IMAGE · 图片创作</p><div className="suite-header-title"><h1>图片功能</h1><nav><button className="selected" type="button">商详套图 <small>高转化详情视觉方案</small></button><button onClick={() => router.push("/image")} type="button">图片创作 <small>AI 技能一键调用</small></button></nav></div></header>
    <section className="suite-intro"><Sparkles aria-hidden="true" /><p>只需上传几张产品图片，AI 自动规划<strong>主图、卖点图、场景图、功能展示图</strong>，帮助商家快速打造专业级商品详情页面。</p></section>
    <section className="suite-cases"><div className="suite-section-title"><span>CASES · 案例展示</span><h2>商详套图案例</h2></div><div className="suite-case-grid">{[{ label: "主图", copy: "凝时焕光", tone: "blue" }, { label: "卖点图", copy: "一抹击退暗沉", tone: "rust" }, { label: "场景图", copy: "微米级渗透", tone: "gold" }, { label: "功能图", copy: "使用前后对比", tone: "mint" }].map((item) => <article key={item.label}><div className={`suite-case-visual ${item.tone}`}><span>{item.label}</span></div><small>{item.label} · {item.copy}</small></article>)}</div></section>
    <section className="suite-guide"><span>操作指引</span><p><i>1</i>选择商品图：上传 1–5 张产品图，支持白底图与场景图</p><p><i>2</i>配置生成方案：文案语言 / 模式 / 张数与补充说明</p><p><i>3</i>AI 分析并规划视觉方案，确认后生成整套详情图</p></section>
  </main><aside className="suite-panel"><header><span className="image-panel-badge"><Sparkles aria-hidden="true" /></span><strong>商详套图</strong><button type="button">＋ 新建</button></header><div className="suite-panel-body"><label className="suite-label">商品图片 <em>· 必填</em><span>{assets.length} / 5</span></label><button className={`suite-product-input ${assets.length ? "has-assets" : ""} ${error.includes("上传") || error.includes("图片") || error === "最多 5 张" ? "invalid" : ""}`} disabled={uploading || assets.length >= 5} onClick={() => inputRef.current?.click()} type="button">{uploading ? <LoaderCircle className="spin" /> : <UploadCloud />}<strong>{uploading ? "正在上传…" : assets.length ? "继续添加商品图片" : "选择或上传商品图片"}</strong><small>PNG / JPG / JPEG / WebP · 单张最大 20MB · 最多 5 张</small></button><input accept="image/jpeg,image/png,image/webp" hidden multiple onChange={chooseProducts} ref={inputRef} type="file" /><button className="suite-library-entry" disabled={uploading || assets.length >= 5} onClick={() => void openLibrary()} type="button"><FolderOpen /><span><strong>从资产库选择</strong><small>使用已上传或 AI 生成的图片</small></span><em>还可选 {5 - assets.length} 张</em></button>
    {assets.length > 0 && <div className="suite-assets">{assets.map((asset, index) => <div key={asset.id}><ImageIcon /><span>{index + 1}. {asset.name}</span><button aria-label={`移除 ${asset.name}`} onClick={() => setAssets((items) => items.filter((item) => item.id !== asset.id))} type="button"><X /></button></div>)}</div>}
    {error && <p className="suite-error" role="alert">{error}</p>}<label className="suite-label">补充说明 <em>· 选填</em><span>{instructions.length} / 2000</span></label><textarea className="suite-textarea" maxLength={2000} onChange={(event) => setInstructions(event.target.value)} placeholder="卖点方向、目标人群、禁用元素、希望呈现的风格…" value={instructions} />
    <div className="suite-divider" /><label className="suite-label">模型</label><select onChange={(event) => setModel(event.target.value)} value={model}><option value="seedream-image-flash">豆包 Seedream 5.0 Flash · 已接入</option><option value="wanxiang-image">通义万相 · 尚未接入</option><option value="hunyuan-image">腾讯混元 · 尚未接入（PRO）</option></select><div className="suite-config-grid"><label>文案语言<select onChange={(event) => setLanguage(event.target.value)} value={language}><option>中文</option><option>英文</option></select></label><label>生成模式<select onChange={(event) => setMode(event.target.value)} value={mode}><option>标准模式</option><option>创意模式</option></select></label><label>画幅比例<select onChange={(event) => setRatio(event.target.value)} value={ratio}><option>1:1</option><option>3:4</option></select></label><label>图片设置<select onChange={(event) => setFormat(event.target.value)} value={format}><option>1K · PNG</option><option>2K · PNG</option><option>1K · JPG</option></select></label><label>张数<select onChange={(event) => setCount(Number(event.target.value))} value={count}><option value={4}>4 张</option><option value={3}>3 张</option><option value={5}>5 张</option></select></label></div><button className="suite-generate" disabled={!assets.length || uploading || model !== "seedream-image-flash"} onClick={planSuite} type="button">立即生成图片 <span>预计 {estimatedCredits} 积分</span></button>
    <div className="suite-history"><div><span>HISTORY · 生成记录</span><small>0 / 40</small></div><section>暂无生成记录<small>提交任务后将在此跟踪进度</small></section></div></div></aside>
    {libraryOpen && <div className="auth-guide-backdrop" onMouseDown={() => setLibraryOpen(false)}><section className="asset-picker" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><header><div><span>ASSET LIBRARY</span><h2>从资产库选择商品图</h2><p>还可选择 {5 - assets.length} 张，素材只建立引用，不会重复上传。</p></div><button onClick={() => setLibraryOpen(false)} type="button"><X /></button></header>{libraryLoading ? <div className="asset-picker-loading"><LoaderCircle className="spin" />正在加载图片资产</div> : libraryAssets.length ? <div className="asset-picker-grid">{libraryAssets.map((asset) => { const selected = librarySelection.includes(asset.id); return <button className={selected ? "selected" : ""} onClick={() => toggleLibraryAsset(asset.id)} type="button" key={asset.id}>{asset.previewUrl ? <img alt={asset.name} src={asset.previewUrl} /> : <span><ImageIcon /></span>}<strong>{asset.name}</strong><small>{asset.source === "AI_GENERATED" ? "AI 生成" : "本地上传"}</small><i>{selected ? "已选择" : "选择"}</i></button>; })}</div> : <div className="asset-picker-empty"><ImageIcon /><strong>资产库暂无可选图片</strong><small>请先使用本地上传添加商品图</small></div>}<footer><span>已选 {librarySelection.length} / {5 - assets.length}</span><button className="secondary-action" onClick={() => setLibraryOpen(false)} type="button">取消</button><button className="primary-action" disabled={!librarySelection.length} onClick={confirmLibrarySelection} type="button">添加所选图片</button></footer></section></div>}
    {showPlan && <div className="auth-guide-backdrop"><section className="suite-plan editable" role="dialog" aria-modal="true"><span>AI 视觉规划</span><h2>调整商详套图方案</h2><p className="plan-intro">每张图可以修改定位、创作要求和引用商品图。最终按启用张数计费。</p><div className="editable-plan-list">{plan.map((item, index) => <article key={item.id}><div className="plan-order"><i>{index + 1}</i><button disabled={index === 0} onClick={() => movePlan(index, -1)} type="button" aria-label="上移"><ChevronUp /></button><button disabled={index === plan.length - 1} onClick={() => movePlan(index, 1)} type="button" aria-label="下移"><ChevronDown /></button></div><div className="plan-fields"><label>图片定位<select value={item.type} onChange={(event) => updatePlan(item.id, { type: event.target.value })}>{["主图", "卖点图", "场景图", "功能展示图", "品牌氛围图"].map((type) => <option key={type}>{type}</option>)}</select></label><label>单张创作要求<input maxLength={300} onChange={(event) => updatePlan(item.id, { instruction: event.target.value })} placeholder="例如：突出轻薄材质，面向通勤女性" value={item.instruction} /></label><fieldset><legend>引用商品图</legend><div>{assets.map((asset, assetIndex) => <label key={asset.id}><input checked={item.referenceIds.includes(asset.id)} onChange={(event) => updatePlan(item.id, { referenceIds: event.target.checked ? [...item.referenceIds, asset.id] : item.referenceIds.filter((id) => id !== asset.id) })} type="checkbox" />图 {assetIndex + 1}</label>)}</div></fieldset></div><button className="plan-remove" disabled={plan.length <= 1} onClick={() => setPlan((items) => items.filter((candidate) => candidate.id !== item.id))} type="button" aria-label={`删除第 ${index + 1} 张`}><X /></button></article>)}</div><div className="plan-summary"><span>{language} · {mode} · {ratio} · {format}</span><strong>共 {plan.length} 张 · 预计 {estimatedCredits} 积分</strong></div><footer><button className="secondary-action" onClick={() => setShowPlan(false)} type="button">返回修改</button><button className="primary-action" disabled={uploading || !plan.length || plan.some((item) => !item.referenceIds.length)} onClick={submitSuite} type="button">{uploading ? "正在提交…" : "确认方案并生成"}</button></footer></section></div>}
  </div>;
}

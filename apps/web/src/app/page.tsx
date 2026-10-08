"use client";

import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  BookOpen,
  Clapperboard,
  Eraser,
  FileImage,
  LayoutDashboard,
  Maximize2,
  LoaderCircle,
  Play,
  Plus,
  Shirt,
  Sparkles,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { StudioSidebar } from "../components/studio-sidebar";
import { ApiError, hasSession, type Asset, uploadAsset } from "../lib/api";

const quickTools: ReadonlyArray<{ icon: LucideIcon; label: string; href?: string }> = [
  { icon: LayoutDashboard, label: "画布", href: "/canvas" }, { icon: Clapperboard, label: "剪辑台" },
  { icon: Maximize2, label: "画质增强" }, { icon: Eraser, label: "水印擦除" },
  { icon: Shirt, label: "字幕擦除" }, { icon: WandSparkles, label: "图片精修", href: "/image?tool=image-retouche" },
];

const goals = [
  { title: "深度复刻", description: "分析参考视频并复刻创意与镜头", tone: "moss", type: "video", href: "/create/video-recreation" },
  { title: "商详套图", description: "根据商品卖点生成整套详情图", tone: "jade", type: "image", href: "/create/product-detail-set" },
  { title: "电商带货", description: "快速生成产品展示与带货视频", tone: "amber", type: "video", href: "/create/ecommerce-video" },
  { title: "同城到店", description: "轻松制作本地探店推广视频", tone: "forest", type: "video", href: "/create/ecommerce-video?category=同城到店" },
  { title: "品牌广告", description: "打造品牌质感广告片", tone: "ochre", type: "video", href: "/create/ecommerce-video?category=品牌广告" },
] as const;

const examples = [
  { title: "秋日针织开衫 · 街拍上身", ratio: "3:4", tone: "plum", type: "图片" },
  { title: "轻奢精华 · 商详套图四张", ratio: "3:4", tone: "blue", type: "图片" },
  { title: "山城小面 · 到店实录 15s", ratio: "9:16", tone: "rust", type: "视频" },
  { title: "白底图转模特街拍复刻", ratio: "9:16", tone: "gold", type: "视频" },
  { title: "夏季防晒服 · 极简详情页", ratio: "3:4", tone: "mint", type: "图片" },
  { title: "新品咖啡 · 氛围短片", ratio: "9:16", tone: "sand", type: "视频" },
  { title: "运动鞋服 · 动态展示", ratio: "9:16", tone: "orange", type: "视频" },
  { title: "通勤女装 · 模特上身", ratio: "3:4", tone: "lime", type: "图片" },
] as const;

type Filter = "全部" | "视频" | "图片";

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [quickNotice, setQuickNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("全部");
  const [pendingGoal, setPendingGoal] = useState<(typeof goals)[number] | null>(null);
  const filteredExamples = useMemo(
    () => examples.filter((item) => filter === "全部" || item.type === filter), [filter],
  );

  function openGoal(goal: (typeof goals)[number]) {
    if (hasSession()) router.push(goal.href);
    else setPendingGoal(goal);
  }

  function openAgent() {
    if (!prompt.trim() && assets.length === 0) return;
    if (prompt.trim()) sessionStorage.setItem("agent_draft", prompt.trim());
    if (assets.length) sessionStorage.setItem("agent_home_transfer", JSON.stringify(assets));
    router.push(hasSession() ? "/agent" : `/auth?next=${encodeURIComponent("/agent")}`);
  }

  function chooseAsset() {
    if (!hasSession()) {
      if (prompt.trim()) sessionStorage.setItem("agent_draft", prompt.trim());
      router.push(`/auth?next=${encodeURIComponent("/agent")}`);
      return;
    }
    inputRef.current?.click();
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (assets.length + files.length > 10) return void setUploadError("最多添加 10 个参考素材");
    setUploading(true); setUploadError("");
    try {
      const uploaded = await Promise.all(files.map(uploadAsset));
      setAssets((items) => [...items, ...uploaded]);
    } catch (reason) {
      setUploadError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : "素材上传失败");
    } finally {
      setUploading(false);
    }
  }

  function openQuickTool(tool: (typeof quickTools)[number]) {
    if (tool.href) {
      router.push(tool.href);
      return;
    }
    setQuickNotice(`「${tool.label}」正在开发中，后续版本开放`);
    window.setTimeout(() => setQuickNotice(""), 2600);
  }

  return (
    <div className="studio-shell">
      <StudioSidebar />

      <main className="workspace">
        <header className="workspace-header">
          <div><p className="product-kicker">XINGGOU · E-COMMERCE AI STUDIO</p><h1>今天想创作什么？</h1></div>
          <button className="manual-button" type="button"><BookOpen aria-hidden="true" />使用手册</button>
        </header>

        <section className="agent-composer" aria-label="Agent 创作输入">
          <div className="composer-main">
            <button className="add-asset" disabled={uploading} onClick={chooseAsset} type="button" aria-label="添加素材">{uploading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
            <textarea maxLength={2000} onChange={(event) => setPrompt(event.target.value)} placeholder="结合参考，输入文字或 @ 主体，说说今天想做什么..." value={prompt} />
          </div>
          {assets.length > 0 && <div className="agent-attachments home-agent-attachments">{assets.map((asset) => <span key={asset.id}><FileImage aria-hidden="true" />{asset.name}<button aria-label={`移除 ${asset.name}`} onClick={() => setAssets((items) => items.filter((item) => item.id !== asset.id))} type="button"><X /></button></span>)}</div>}
          {uploadError && <p className="home-upload-error" role="alert">{uploadError}</p>}
          <div className="composer-footer">
            <span className="mode-select mode-indicator"><Sparkles aria-hidden="true" />Agent 智能路由</span>
            <div className="submit-area"><span>{prompt.length} / 2000</span><button className="submit-button" disabled={!prompt.trim() && assets.length === 0} onClick={openAgent} type="button" aria-label="发送"><ArrowUp aria-hidden="true" /></button></div>
          </div>
          <input accept="image/jpeg,image/png,image/webp" hidden multiple onChange={uploadFiles} ref={inputRef} type="file" />
        </section>

        <section className="quick-tools" aria-label="快捷工具">
          {quickTools.map((tool) => { const Icon = tool.icon; return <button aria-describedby={!tool.href ? "quick-tool-notice" : undefined} className={!tool.href ? "coming-soon" : ""} key={tool.label} onClick={() => openQuickTool(tool)} type="button"><Icon aria-hidden="true" /><strong>{tool.label}</strong>{!tool.href && <small>开发中</small>}</button>; })}
        </section>
        <div aria-live="polite" className={`quick-tool-notice ${quickNotice ? "visible" : ""}`} id="quick-tool-notice" role="status">{quickNotice}</div>

        <section className="content-section">
          <div className="section-heading"><div className="heading-prefix"><span>START</span><i />选择创作目标快速开始</div><h2>你想做什么？</h2></div>
          <div className="goal-grid">
            {goals.map((goal) => (
              <button className="goal-card" key={goal.title} onClick={() => openGoal(goal)} type="button">
                <div className={`goal-visual ${goal.tone}`}><span className="orbit orbit-one" /><span className="orbit orbit-two" />{goal.type === "video" && <span className="play"><Play aria-hidden="true" fill="currentColor" /></span>}<span className="duration">00:00</span></div>
                <span className="goal-copy"><strong>{goal.title}</strong><small>{goal.description}</small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="content-section discover">
          <div className="discover-header">
            <div className="section-heading inline"><div className="heading-prefix"><span>DISCOVER</span><i />社区案例</div><h2>发现</h2></div>
            <div className="filters">{(["全部", "视频", "图片"] as const).map((item) => <button className={filter === item ? "selected" : ""} key={item} onClick={() => setFilter(item)} type="button">{item}</button>)}</div>
          </div>
          <div className="example-grid">
            {filteredExamples.map((example) => (
              <article className="example-card" key={example.title}>
                <div className={`example-visual ${example.tone}`}><span className="ratio">{example.ratio}</span><span className="large-orbit" />{example.type === "视频" && <span className="play"><Play aria-hidden="true" fill="currentColor" /></span>}</div>
                <p>{example.title}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      {pendingGoal && (
        <div className="auth-guide-backdrop" onMouseDown={() => setPendingGoal(null)} role="presentation">
          <section aria-labelledby="auth-guide-title" aria-modal="true" className="auth-guide" onMouseDown={(event) => event.stopPropagation()} role="dialog">
            <span className="auth-guide-tag">继续创作</span>
            <h2 id="auth-guide-title">登录后使用「{pendingGoal.title}」</h2>
            <p>登录后将自动回到当前创作目标。正式生成前，系统会根据套餐与积分规则校验使用资格。</p>
            <div><button className="secondary-action" onClick={() => setPendingGoal(null)} type="button">暂不登录</button><button className="primary-action" onClick={() => router.push(`/auth?next=${encodeURIComponent(pendingGoal.href)}`)} type="button">登录并继续</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

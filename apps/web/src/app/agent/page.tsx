"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Bot, FileImage, LoaderCircle, Plus, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, apiStreamRequest, ApiError, type Asset, hasSession, uploadAsset } from "../../lib/api";

type AgentResponse = {
  intent: string;
  confidence: number;
  reply: string;
  targetPath: string | null;
  transferredAssetIds: string[];
  requiresClarification: boolean;
  slots: Record<string, string>;
};
type MessageAsset = Pick<Asset, "id" | "name" | "kind">;
type AgentCard = { intent: string; label: string; targetPath: string; slots: Record<string, string>; assets: MessageAsset[] };
type Message = { role: "user" | "agent"; text: string; assets?: MessageAsset[]; card?: AgentCard };
const SESSION_KEY = "xinggou_agent_session_v1";

const INTENT_LABELS: Record<string, string> = {
  product_detail_set: "商详套图",
  video_recreation: "深度复刻",
  virtual_try_on: "服装上身",
  director_video: "超级编导",
  product_white_background: "商品白底图",
  image_retouche: "图片精修",
  product_use: "商品使用",
  clothing_redesign: "服装改款",
  face_three_view: "脸部三视图",
  person_four_view: "人物四视图",
  model_face_swap: "模特换脸",
  face_fusion: "人脸融合",
  person_in_scene: "人物入景",
  person_realism: "人物真人感",
};
const SLOT_LABELS: Record<string, string> = {
  count: "张数",
  language: "文案语言",
  quality: "清晰度",
  resolution: "分辨率",
  format: "格式",
  category: "场景类型",
  duration: "时长",
  ratio: "比例",
};

export default function AgentPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagePreviewUrls, setMessagePreviewUrls] = useState<Record<string, string>>({});
  const [mentionCatalog, setMentionCatalog] = useState<Asset[]>([]);
  const [mentionPreviewUrls, setMentionPreviewUrls] = useState<Record<string, string>>({});
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionLoaded, setMentionLoaded] = useState(false);
  const [lastSlots, setLastSlots] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    if (!hasSession()) return void router.replace("/auth?next=/agent");
    apiRequest<{ id: string }>("/auth/me").then((user) => { setUserId(user.id); setReady(true); }).catch(() => router.replace("/auth?next=/agent"));
  }, [router]);

  useEffect(() => {
    const draft = sessionStorage.getItem("agent_draft");
    if (draft) { setPrompt(draft.slice(0, 2000)); sessionStorage.removeItem("agent_draft"); }
    try {
      const transferred = JSON.parse(sessionStorage.getItem("agent_home_transfer") ?? "null") as Asset[] | null;
      if (transferred?.length) setAssets((items) => [...items, ...transferred.filter((asset) => !items.some((item) => item.id === asset.id))].slice(0, 10));
    } catch { /* 忽略失效的页面传递数据 */ }
    sessionStorage.removeItem("agent_home_transfer");
  }, []);

  useEffect(() => {
    if (!userId) return;
    setSessionLoaded(false);
    try {
      const stored = JSON.parse(localStorage.getItem(`${SESSION_KEY}:${userId}`) ?? "null") as { messages?: Message[]; assets?: Asset[]; lastSlots?: Record<string, string> } | null;
      if (stored?.messages) setMessages(stored.messages.slice(-40));
      if (stored?.assets) setAssets((items) => [...items, ...stored.assets!.filter((asset) => !items.some((item) => item.id === asset.id))].slice(0, 10));
      if (stored?.lastSlots) setLastSlots(stored.lastSlots);
    } catch { localStorage.removeItem(`${SESSION_KEY}:${userId}`); }
    setSessionLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!sessionLoaded || !userId) return;
    localStorage.setItem(`${SESSION_KEY}:${userId}`, JSON.stringify({ messages: messages.slice(-40), assets, lastSlots }));
  }, [assets, lastSlots, messages, sessionLoaded, userId]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const ids = [...new Set(messages.flatMap((message) => message.assets?.map((asset) => asset.id) ?? []))]
      .filter((id) => !messagePreviewUrls[id]);
    if (!ids.length) return;
    let disposed = false;
    void Promise.allSettled(ids.map(async (id) => {
      const download = await apiRequest<{ url: string }>(`/assets/${id}/download-url`);
      return [id, download.url] as const;
    })).then((results) => {
      if (disposed) return;
      const loaded = Object.fromEntries(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
      if (Object.keys(loaded).length) setMessagePreviewUrls((current) => ({ ...current, ...loaded }));
    });
    return () => { disposed = true; };
  }, [messages, messagePreviewUrls]);

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    setBusy(true); setError("");
    try {
      const uploaded = await Promise.all(selected.map(uploadAsset));
      setAssets((items) => [...items, ...uploaded.filter((asset) => !items.some((item) => item.id === asset.id))].slice(0, 10));
      const previews = await Promise.allSettled(uploaded.map(async (asset) => {
        const download = await apiRequest<{ url: string }>(`/assets/${asset.id}/download-url`);
        return [asset.id, download.url] as const;
      }));
      setMentionPreviewUrls((current) => ({ ...current, ...Object.fromEntries(previews.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : [])) }));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "素材上传失败"); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = prompt.trim();
    if ((!message && assets.length === 0) || message.length > 2000 || busy) return;
    const sentAssets = assets.map(({ id, name, kind }) => ({ id, name, kind }));
    const history = messages.slice(-20).map(({ role, text }) => ({ role, text }));
    setMessages((items) => [...items, { role: "user", text: message, assets: sentAssets }, { role: "agent", text: "" }]);
    setPrompt(""); setBusy(true); setError("");
    try {
      const result = await apiStreamRequest<AgentResponse>("/agent/route/stream", {
        message, assetIds: sentAssets.map((asset) => asset.id), history, slots: lastSlots,
      }, (delta) => setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, text: item.text + delta } : item)));
      setLastSlots(result.slots);
      const card = result.targetPath
        ? { intent: result.intent, label: INTENT_LABELS[result.intent] ?? result.intent, targetPath: result.targetPath, slots: result.slots, assets: sentAssets }
        : undefined;
      setMessages((items) => items.map((item, index) => index === items.length - 1 ? { role: "agent" as const, text: result.reply, ...(card ? { card } : {}) } : item));
      setAssets([]);
    } catch (reason) {
      setMessages((items) => items.filter((item, index) => index !== items.length - 1 || item.text.length > 0));
      setError(reason instanceof ApiError ? reason.message : "Agent 暂时无法处理，请稍后重试");
    }
    finally { setBusy(false); }
  }

  const mentionMatch = prompt.match(/(?:^|\s)@([^@\s]*)$/);
  const mentionQuery = mentionMatch?.[1]?.toLowerCase() ?? null;
  const mentionOpen = mentionQuery !== null;
  const mentionAssets = mentionQuery === null ? [] : [...assets, ...mentionCatalog.filter((candidate) => !assets.some((asset) => asset.id === candidate.id))]
    .filter((asset) => asset.name.toLowerCase().includes(mentionQuery)).slice(0, 12);

  useEffect(() => {
    if (!mentionOpen || mentionLoaded) return;
    let disposed = false;
    setMentionLoading(true);
    void apiRequest<{ items: Asset[] }>("/assets?kind=IMAGE&pageSize=50").then(async (result) => {
      if (disposed) return;
      setMentionCatalog(result.items);
      const previews = await Promise.allSettled(result.items.slice(0, 24).map(async (asset) => {
        const download = await apiRequest<{ url: string }>(`/assets/${asset.id}/download-url`);
        return [asset.id, download.url] as const;
      }));
      if (!disposed) setMentionPreviewUrls(Object.fromEntries(previews.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : [])));
    }).catch(() => {
      if (!disposed) setError("资产库中的主体加载失败，仍可选择当前上传素材");
    }).finally(() => {
      if (!disposed) { setMentionLoading(false); setMentionLoaded(true); }
    });
    return () => { disposed = true; };
  }, [mentionLoaded, mentionOpen]);

  function completeMention(asset: Asset) {
    setPrompt((value) => value.replace(/(?:^|\s)@([^@\s]*)$/, (matched) => `${matched.startsWith(" ") ? " " : ""}@${asset.name} `));
    setAssets((items) => items.some((item) => item.id === asset.id) ? items : [...items, asset].slice(0, 10));
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function clearConversation() {
    setMessages([]); setAssets([]); setLastSlots({}); setPrompt(""); setError("");
    if (userId) localStorage.removeItem(`${SESSION_KEY}:${userId}`);
  }

  function openTarget(card: AgentCard) {
    const cardAssets = card.assets ?? [];
    sessionStorage.setItem("agent_transfer", JSON.stringify({
      assetIds: cardAssets.map((asset) => asset.id),
      assets: cardAssets,
      targetPath: card.targetPath,
      createdAt: Date.now(),
    }));
    if (card.intent === "product_white_background") {
      sessionStorage.setItem("generation_draft", JSON.stringify({
        capability: "product_white_background",
        assetIds: cardAssets.map((asset) => asset.id),
        prompt: "",
        parameters: {
          resolution: card.slots.resolution === "2K" ? "2K" : "1K",
          format: card.slots.format === "JPG" ? "JPG" : "PNG",
        },
      }));
    }
    router.push(card.targetPath);
  }

  if (!ready) return <main className="route-message"><p>正在检查登录状态…</p></main>;

  return <div className="studio-shell"><StudioSidebar /><main className="workspace agent-workspace"><header className="workspace-header"><div><p className="product-kicker">AGENT · 智能创作路由</p><h1>今天想创作什么？</h1></div>{(messages.length > 0 || assets.length > 0) && <button className="agent-clear" onClick={clearConversation} type="button"><Trash2 aria-hidden="true" />清空会话</button>}</header>
    {messages.length > 0 && <section className="agent-thread" aria-live="polite" ref={threadRef}>{messages.map((message, index) => <div className={`agent-message ${message.role}`} key={`${message.role}-${index}`}>
      {message.role === "agent" && <Bot aria-hidden="true" />}
      <div className="agent-bubble-wrap">
        {(message.text || (busy && index === messages.length - 1)) && <p>{message.text || "正在思考…"}</p>}
        {message.assets && message.assets.length > 0 && <div className="agent-message-assets">{message.assets.map((asset) => messagePreviewUrls[asset.id] ? <button aria-label={`预览 ${asset.name}`} key={asset.id} onClick={() => window.open(messagePreviewUrls[asset.id], "_blank", "noopener,noreferrer")} title={asset.name} type="button"><img alt={asset.name} src={messagePreviewUrls[asset.id]} /><span>{asset.name}</span></button> : <span key={asset.id}><FileImage aria-hidden="true" />{asset.name}</span>)}</div>}
        {message.card && <div className="agent-card">
          <div className="agent-card-head"><span className="agent-card-badge"><WandSparkles aria-hidden="true" /></span><strong>{message.card.label}</strong>{(message.card.assets?.length ?? 0) > 0 && <small>已附带 {message.card.assets.length} 个素材</small>}</div>
          {Object.keys(message.card.slots).length > 0 && <ul className="agent-card-slots">{Object.entries(message.card.slots).map(([key, value]) => <li key={key}><span>{SLOT_LABELS[key] ?? key}</span><strong>{value}</strong></li>)}</ul>}
          <button className="agent-card-action" onClick={() => openTarget(message.card!)} type="button">打开创作流程<ArrowUp aria-hidden="true" /></button>
        </div>}
      </div>
    </div>)}</section>}
    <form className="agent-composer agent-page-composer" onSubmit={submit}><div className="composer-main"><button className="add-asset" disabled={busy} onClick={() => inputRef.current?.click()} type="button" aria-label="添加素材"><Plus aria-hidden="true" /></button><textarea maxLength={2000} onChange={(event) => setPrompt(event.target.value)} placeholder="结合参考，输入文字或 @ 主体，说说今天想做什么..." ref={textareaRef} value={prompt} />{mentionQuery !== null && <div className="agent-mention-menu"><header><strong>@ 选择主体</strong><small>当前上传与最近图片</small></header>{mentionAssets.length ? mentionAssets.map((asset) => <button key={asset.id} onClick={() => completeMention(asset)} type="button">{mentionPreviewUrls[asset.id] || messagePreviewUrls[asset.id] ? <img alt="" src={mentionPreviewUrls[asset.id] ?? messagePreviewUrls[asset.id]} /> : <FileImage aria-hidden="true" />}<span><strong>{asset.name}</strong><small>{assets.some((item) => item.id === asset.id) ? "当前已上传" : asset.source === "AI_GENERATED" ? "AI 生成 · 点击引用" : "资产库 · 点击引用"}</small></span></button>) : <p>{mentionLoading ? "正在加载主体…" : "没有匹配的图片，可点击 + 上传"}</p>}</div>}</div>
      {assets.length > 0 && <div className="agent-attachments">{assets.map((asset) => <span key={asset.id}><FileImage aria-hidden="true" /><button className="agent-mention" onClick={() => setPrompt((value) => `${value}${value && !value.endsWith(" ") ? " " : ""}@${asset.name} `)} title="在输入中引用该主体" type="button">{asset.name}</button><button aria-label={`移除 ${asset.name}`} onClick={() => setAssets((items) => items.filter((item) => item.id !== asset.id))} type="button"><X /></button></span>)}</div>}
      <div className="composer-footer"><span className="mode-select"><Sparkles aria-hidden="true" />Agent 模式</span><div className="submit-area"><span className={prompt.length >= 2000 ? "limit" : ""}>{prompt.length} / 2000</span><button className="submit-button" disabled={(!prompt.trim() && assets.length === 0) || busy} type="submit" aria-label="发送">{busy ? <LoaderCircle className="spin" /> : <ArrowUp />}</button></div></div>
      <input accept="image/jpeg,image/png,image/webp" hidden multiple onChange={chooseFiles} ref={inputRef} type="file" />
    </form>{error && <p className="asset-notice" role="alert">{error}</p>}
    <section className="agent-tips"><strong>你可以这样说</strong><button onClick={() => setPrompt("帮我给这个包做一套详情页，4 张中文")} type="button">帮我给这个包做一套详情页</button><button onClick={() => setPrompt("给这张商品图出个白底图，2K PNG")} type="button">给这张商品图出个白底图</button><button onClick={() => setPrompt("帮我拍一条电商带货视频")} type="button">帮我拍一条带货视频</button><small>Agent 只负责理解和路由，确认生成参数前不会扣除积分。</small></section>
  </main></div>;
}

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, FilePlus2, LayoutTemplate, LoaderCircle, PenLine, Trash2, X } from "lucide-react";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, ApiError, createCanvas, deleteCanvas, hasSession, listCanvases, type CanvasSummary } from "../../lib/api";
import { CANVAS_TEMPLATES, getTemplate } from "../../lib/canvas-templates";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CanvasListPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<CanvasSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templateId, setTemplateId] = useState(CANVAS_TEMPLATES[0]!.id);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try { setItems(await listCanvases()); }
    catch { router.replace("/auth?next=/canvas"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    if (!hasSession()) return void router.replace("/auth?next=/canvas");
    apiRequest("/auth/me").then(() => { setReady(true); void load(); }).catch(() => router.replace("/auth?next=/canvas"));
  }, [load, router]);

  async function remove(item: CanvasSummary) {
    if (!window.confirm(`删除画布「${item.name}」？此操作不可恢复。`)) return;
    setNotice("");
    try { await deleteCanvas(item.id); setItems((current) => current.filter((entry) => entry.id !== item.id)); }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "画布删除失败"); }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    const template = getTemplate(templateId);
    const canvasName = name.trim() || template.name;
    setCreating(true);
    setNotice("");
    try {
      const created = await createCanvas({ name: canvasName, content: template.content });
      router.push(`/canvas/${created.id}`);
    } catch (reason) {
      setNotice(reason instanceof ApiError ? reason.message : "画布创建失败，请稍后重试");
      setCreating(false);
    }
  }
  if (!ready) return <main className="route-message"><p>正在检查登录状态…</p></main>;

  return <div className="studio-shell"><StudioSidebar /><main className="workspace canvas-workspace">
    <header className="assets-header"><div><p className="product-kicker">CANVAS · 无限画布</p><h1>画布</h1><p>一块画布，连接创意、素材与成片 · 文本 / 图片 / 视频 / 音频四类节点，支持 AI 生成与引用关系</p></div><button className="canvas-new-button" onClick={() => { setTemplateId(CANVAS_TEMPLATES[0]!.id); setName(""); setDialogOpen(true); }} type="button"><FilePlus2 />新建画布</button></header>
    {notice && <p className="asset-notice" role="alert">{notice}</p>}
    {loading ? <section className="asset-loading"><LoaderCircle className="spin" />正在加载画布列表</section>
      : items.length === 0 ? <section className="asset-empty"><span className="empty-icon"><LayoutTemplate /></span><h2>还没有画布</h2><p>新建一块画布，把脚本、素材和成片连起来。</p><button onClick={() => { setTemplateId(CANVAS_TEMPLATES[0]!.id); setName(""); setDialogOpen(true); }} type="button"><FilePlus2 />新建画布</button></section>
      : <section className="canvas-list-grid">{items.map((item) => <article className="canvas-list-card" key={item.id}>
        <div className="canvas-list-thumb"><LayoutTemplate aria-hidden="true" /><span>{item.name.slice(0, 1)}</span></div>
        <strong title={item.name}>{item.name}</strong>
        <small><Clock3 aria-hidden="true" />更新于 {formatTime(item.updatedAt)} · <em className="canvas-node-count">{item.nodeCount} 个节点</em></small>
        <div className="canvas-list-actions"><button className="canvas-open" onClick={() => router.push(`/canvas/${item.id}`)} type="button"><PenLine />打开</button><button aria-label={`删除 ${item.name}`} className="canvas-delete" onClick={() => void remove(item)} type="button"><Trash2 /></button></div>
      </article>)}</section>}
  </main>
    {dialogOpen && <NewCanvasDialog creating={creating} name={name} onClose={() => setDialogOpen(false)} onNameChange={setName} onSubmit={(event) => void create(event)} onTemplateChange={setTemplateId} templateId={templateId} />}
  </div>;
}

function NewCanvasDialog({ creating, name, templateId, onClose, onNameChange, onSubmit, onTemplateChange }: {
  creating: boolean;
  name: string;
  templateId: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onTemplateChange: (value: string) => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="picker-overlay" onClick={onClose} role="presentation">
    <form aria-modal="true" className="picker-modal canvas-template-modal" onClick={(event) => event.stopPropagation()} onSubmit={onSubmit} role="dialog">
      <header className="picker-header">
        <strong>新建画布</strong>
        <small>选择一个模板快速开始，也可以在画布内自由搭建</small>
        <button aria-label="关闭" onClick={onClose} type="button"><X /></button>
      </header>
      <div className="canvas-template-options">{CANVAS_TEMPLATES.map((template) => <button aria-pressed={templateId === template.id} className={templateId === template.id ? "selected" : ""} key={template.id} onClick={() => onTemplateChange(template.id)} type="button"><LayoutTemplate aria-hidden="true" /><strong>{template.name}</strong><small>{template.description}</small></button>)}</div>
      <label className="canvas-template-name">画布名称<input autoFocus maxLength={40} onChange={(event) => onNameChange(event.target.value)} placeholder="未命名画布" value={name} /></label>
      <footer className="picker-footer"><button className="picker-cancel" onClick={onClose} type="button">取消</button><button className="picker-confirm" disabled={creating} type="submit">{creating ? "正在创建…" : "创建画布"}</button></footer>
    </form>
  </div>;
}

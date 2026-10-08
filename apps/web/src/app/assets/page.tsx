"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, FileAudio, FileImage, FileVideo, FolderOpen, LoaderCircle, LogIn, Plus, Search, Trash2, UploadCloud, X } from "lucide-react";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, ApiError, type Asset, hasSession } from "../../lib/api";

type Filter = "ALL" | "IMAGE" | "VIDEO" | "AUDIO";
type UploadState = { name: string; status: "uploading" | "failed"; message?: string };
type AssetReference = { taskId: string; capability: string; createdAt: string; relation: "INPUT" | "OUTPUT" };
const capabilityLabels: Record<string, string> = { product_detail_set: "商详套图", video_recreation: "深度复刻", director_video: "超级编导", virtual_try_on: "服装上身", product_use: "商品使用", clothing_redesign: "服装改款", face_three_view: "脸部三视图", person_four_view: "人物四视图", model_face_swap: "模特换脸", face_fusion: "人脸融合", person_in_scene: "人物入景", person_realism: "人物真人感", product_white_background: "商品白底图", image_retouche: "图片精修" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function assetIcon(kind: Asset["kind"]) {
  if (kind === "VIDEO") return <FileVideo aria-hidden="true" />;
  if (kind === "AUDIO") return <FileAudio aria-hidden="true" />;
  return <FileImage aria-hidden="true" />;
}

export default function AssetsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [deleteReferences, setDeleteReferences] = useState<AssetReference[]>([]);
  const [checkingReferences, setCheckingReferences] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const query = filter === "ALL" ? "" : `?kind=${filter}`;
      const result = await apiRequest<{ items: Asset[]; nextCursor: string | null }>(`/assets${query}`);
      setAssets(result.items);
      setAuthenticated(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setAuthenticated(false);
      else setNotice(reason instanceof ApiError ? reason.message : "资产加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!hasSession()) {
      setAuthenticated(false);
      setLoading(false);
      router.replace("/auth?next=/assets");
      return;
    }
    void loadAssets();
  }, [loadAssets, router]);

  useEffect(() => {
    if (authenticated === false) router.replace("/auth?next=/assets");
  }, [authenticated, router]);

  useEffect(() => {
    let active = true;
    const images = assets.filter((asset) => asset.kind === "IMAGE");
    if (!images.length) return;
    void Promise.all(images.map(async (asset) => {
      const result = await apiRequest<{ url: string }>(`/assets/${asset.id}/download-url`);
      return [asset.id, result.url] as const;
    })).then((entries) => { if (active) setPreviewUrls(Object.fromEntries(entries)); }).catch(() => undefined);
    return () => { active = false; };
  }, [assets]);

  async function uploadFile(file: File) {
    setUploads((items) => [...items, { name: file.name, status: "uploading" }]);
    try {
      const ticket = await apiRequest<{ fileId: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> }>("/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      const response = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file });
      if (!response.ok) throw new Error(`对象存储上传失败（${response.status}）`);
      await apiRequest<Asset>("/uploads/complete", { method: "POST", body: JSON.stringify({ fileId: ticket.fileId }) });
      setUploads((items) => items.filter((item) => item.name !== file.name));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "上传失败";
      setUploads((items) => items.map((item) => item.name === file.name ? { ...item, status: "failed", message } : item));
    }
  }

  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    setNotice("");
    await Promise.all(selected.map(uploadFile));
    await loadAssets();
  }

  async function downloadAsset(asset: Asset) {
    try {
      const result = await apiRequest<{ url: string }>(`/assets/${asset.id}/download-url`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setNotice(reason instanceof ApiError ? reason.message : "下载地址获取失败");
    }
  }

  async function deleteAsset(asset: Asset) {
    setDeleteTarget(asset);
    setDeleteReferences([]);
    setCheckingReferences(true);
    setNotice("");
    try {
      const result = await apiRequest<{ items: AssetReference[] }>(`/assets/${asset.id}/references`);
      setDeleteReferences(result.items);
    } catch (reason) {
      setNotice(reason instanceof ApiError ? reason.message : "删除失败");
      setDeleteTarget(null);
    } finally {
      setCheckingReferences(false);
    }
  }

  async function confirmDeleteAsset() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest<void>(`/assets/${deleteTarget.id}${deleteReferences.length ? "?force=true" : ""}`, { method: "DELETE" });
      setAssets((items) => items.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteReferences([]);
    } catch (reason) {
      setNotice(reason instanceof ApiError ? reason.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  const visibleAssets = assets.filter((asset) => asset.name.toLowerCase().includes(search.trim().toLowerCase()));
  const filterItems: { value: Filter; label: string }[] = [
    { value: "ALL", label: "全部" }, { value: "IMAGE", label: "图片" }, { value: "VIDEO", label: "视频" }, { value: "AUDIO", label: "音频" },
  ];

  return <div className="studio-shell">
    <StudioSidebar />
    <main className="workspace assets-workspace">
      <header className="assets-header">
        <div><p className="product-kicker">ASSET LIBRARY · 素材中心</p><h1>我的资产</h1><p>管理上传素材和 AI 生成结果</p></div>
        {authenticated && <button className="primary-action" onClick={() => inputRef.current?.click()} type="button"><Plus aria-hidden="true" />上传素材</button>}
        <input accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4" hidden multiple onChange={chooseFiles} ref={inputRef} type="file" />
      </header>
      <section className="asset-toolbar">
        <div className="asset-tabs">{filterItems.map((item) => <button className={filter === item.value ? "selected" : ""} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</div>
        <label className="asset-search"><Search aria-hidden="true" /><input aria-label="搜索资产" onChange={(event) => setSearch(event.target.value)} placeholder="搜索资产名称" value={search} /></label>
      </section>
      {notice && <p className="asset-notice" role="alert">{notice}</p>}
      {uploads.length > 0 && <section className="upload-queue">{uploads.map((upload, index) => <div className={upload.status} key={`${upload.name}-${index}`}>{upload.status === "uploading" ? <LoaderCircle className="spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}<span><strong>{upload.name}</strong><small>{upload.status === "uploading" ? "正在上传并创建资产…" : upload.message}</small></span></div>)}</section>}
      {loading ? <section className="asset-loading"><LoaderCircle className="spin" aria-hidden="true" />正在加载资产</section>
      : authenticated === false ? <section className="asset-empty"><span className="empty-icon"><LogIn aria-hidden="true" /></span><h2>登录后使用资产库</h2><p>你的素材、AI 生成结果和创作记录会归属到个人账户。</p><Link className="empty-action" href="/auth">登录或注册</Link><small>生成积分随订阅档位发放</small></section>
      : visibleAssets.length === 0 ? <section className="asset-empty"><span className="empty-icon"><FolderOpen aria-hidden="true" /></span><h2>{search ? "没有匹配的资产" : "还没有资产"}</h2><p>{search ? "换一个关键词试试。" : "上传商品图、参考视频或音频，后续创作时可以直接引用。"}</p>{!search && <button onClick={() => inputRef.current?.click()} type="button"><UploadCloud aria-hidden="true" />选择素材</button>}<small>支持 JPG、PNG、WebP、MP4、MOV、WebM，单文件最大 500MB</small></section>
      : <section className="asset-grid">{visibleAssets.map((asset) => <article className="asset-card" key={asset.id}>
          <div className="asset-preview">{asset.kind === "IMAGE" && previewUrls[asset.id] ? <img alt={asset.name} src={previewUrls[asset.id]} /> : assetIcon(asset.kind)}<span>{asset.source === "AI_GENERATED" ? "AI 生成" : asset.kind === "IMAGE" ? "图片" : asset.kind === "VIDEO" ? "视频" : asset.kind === "AUDIO" ? "音频" : "文档"}</span></div>
          <div className="asset-meta"><strong title={asset.name}>{asset.name}</strong><small>{formatBytes(asset.sizeBytes)} · {new Date(asset.createdAt).toLocaleDateString("zh-CN")}</small></div>
          <div className="asset-actions"><button aria-label={`下载 ${asset.name}`} onClick={() => downloadAsset(asset)} title="下载" type="button"><Download aria-hidden="true" /></button><button aria-label={`删除 ${asset.name}`} onClick={() => deleteAsset(asset)} title="删除" type="button"><Trash2 aria-hidden="true" /></button></div>
        </article>)}</section>}
    </main>
    {deleteTarget && <div className="auth-guide-backdrop" onMouseDown={() => !deleting && setDeleteTarget(null)} role="presentation">
      <section aria-labelledby="asset-delete-title" aria-modal="true" className="asset-delete-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header><span><AlertTriangle aria-hidden="true" /></span><div><h2 id="asset-delete-title">删除资产</h2><p>{deleteTarget.name}</p></div><button aria-label="关闭" disabled={deleting} onClick={() => setDeleteTarget(null)} type="button"><X /></button></header>
        {checkingReferences ? <div className="asset-delete-loading"><LoaderCircle className="spin" />正在检查引用关系</div> : <>
          <p className="asset-delete-warning">{deleteReferences.length ? `该资产关联 ${deleteReferences.length} 个任务关系。删除后，相关任务将无法再预览该素材或结果。` : "该资产未被任务引用。删除后无法恢复。"}</p>
          {deleteReferences.length > 0 && <ul>{deleteReferences.map((reference) => <li key={`${reference.taskId}-${reference.relation}`}><span>{capabilityLabels[reference.capability] ?? reference.capability}</span><small>{reference.relation === "INPUT" ? "输入素材" : "生成结果"} · {new Date(reference.createdAt).toLocaleString("zh-CN")}</small></li>)}</ul>}
          <footer><button disabled={deleting} onClick={() => setDeleteTarget(null)} type="button">取消</button><button className="confirm-delete" disabled={deleting} onClick={() => void confirmDeleteAsset()} type="button">{deleting ? <LoaderCircle className="spin" /> : <Trash2 />}{deleting ? "正在删除" : deleteReferences.length ? "确认删除并断开引用" : "确认删除"}</button></footer>
        </>}
      </section>
    </div>}
  </div>;
}

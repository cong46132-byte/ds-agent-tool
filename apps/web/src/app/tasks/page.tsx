"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Clock3, DownloadCloud, History, Image as ImageIcon, LoaderCircle, RefreshCcw, Trash2, X, XCircle } from "lucide-react";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, ApiError, hasSession } from "../../lib/api";

type TaskOutput = { id: string; assetId: string; position: number; asset: { id: string; name: string; kind: string; mimeType?: string } };
type Task = { id: string; capability: string; status: string; progress: number; estimatedCredits: number; errorMessage: string | null; createdAt: string; input?: { assetIds?: string[]; prompt?: string; parameters?: Record<string, unknown> }; outputs?: TaskOutput[] };
const labels: Record<string, string> = { product_detail_set: "商详套图", video_recreation: "深度复刻", director_video: "超级编导", virtual_try_on: "服装上身", product_use: "商品使用", clothing_redesign: "服装改款", face_three_view: "脸部三视图", person_four_view: "人物四视图", model_face_swap: "模特换脸", face_fusion: "人脸融合", person_in_scene: "人物入景", person_realism: "人物真人感", product_white_background: "商品白底图", image_retouche: "图片精修" };
const editorRoutes: Record<string, string> = { product_detail_set: "/create/product-detail-set", video_recreation: "/create/video-recreation", director_video: "/create/ecommerce-video", virtual_try_on: "/image?tool=virtual-try-on", product_use: "/image?tool=product-use", clothing_redesign: "/image?tool=clothing-redesign", face_three_view: "/image?tool=face-three-view", person_four_view: "/image?tool=person-four-view", model_face_swap: "/image?tool=model-face-swap", face_fusion: "/image?tool=face-fusion", person_in_scene: "/image?tool=person-in-scene", person_realism: "/image?tool=person-realism", product_white_background: "/image?tool=product-white-background", image_retouche: "/image?tool=image-retouche" };

export default function TasksPage() {
  const router = useRouter();
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Task | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [inputPreviewUrl, setInputPreviewUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedOutputIds, setSelectedOutputIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    try { const data = await apiRequest<{ items: Task[] }>("/tasks"); setItems(data.items); }
    catch { router.replace("/auth?next=/tasks"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    if (!hasSession()) return void router.replace("/auth?next=/tasks");
    void load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, [load, router]);

  async function openTask(task: Task) {
    setNotice("");
    try {
      const detail = await apiRequest<Task>(`/tasks/${task.id}`);
      setSelected(detail);
      setInputPreviewUrl("");
      setSelectedOutputIds((detail.outputs ?? []).map((output) => output.assetId));
      const entries = await Promise.all((detail.outputs ?? []).map(async (output) => {
        const result = await apiRequest<{ url: string }>(`/assets/${output.assetId}/download-url`);
        return [output.assetId, result.url] as const;
      }));
      setPreviewUrls(Object.fromEntries(entries));
      if (detail.capability === "image_retouche" && detail.input?.assetIds?.[0]) {
        const inputPreview = await apiRequest<{ url: string }>(`/assets/${detail.input.assetIds[0]}/download-url`);
        setInputPreviewUrl(inputPreview.url);
      }
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "任务详情加载失败"); }
  }

  async function regenerate(task: Task) {
    if (task.status === "SUCCEEDED") { editAndRegenerate(task); return; }
    if (!window.confirm(`将按原素材和原参数重试，成功后预计扣除 ${task.estimatedCredits} 积分。是否继续？`)) return;
    setActionBusy(true); setNotice("");
    try {
      await apiRequest(`/tasks/${task.id}/regenerate`, { method: "POST", body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      setSelected(null); await load();
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "重新生成失败"); }
    finally { setActionBusy(false); }
  }

  function editAndRegenerate(task: Task) {
    if (!task.input) return void setNotice("原任务配置不完整，无法恢复");
    sessionStorage.setItem("generation_draft", JSON.stringify({ sourceTaskId: task.id, capability: task.capability, ...task.input }));
    router.push(editorRoutes[task.capability] ?? "/");
  }

  async function deleteTask(task: Task) {
    if (!window.confirm("删除该历史记录？已生成的结果仍保留在资产库。")) return;
    setActionBusy(true); setNotice("");
    try { await apiRequest(`/tasks/${task.id}`, { method: "DELETE" }); setSelected(null); await load(); }
    catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "历史记录删除失败"); }
    finally { setActionBusy(false); }
  }

  async function cancelTask(task: Task) {
    if (!window.confirm("取消这个排队中的任务？冻结积分将自动退回。")) return;
    setActionBusy(true); setNotice("");
    try {
      const canceled = await apiRequest<Task>(`/tasks/${task.id}/cancel`, { method: "POST" });
      setSelected(canceled); await load();
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "任务取消失败"); }
    finally { setActionBusy(false); }
  }

  function toggleOutput(assetId: string) {
    setSelectedOutputIds((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);
  }

  async function downloadSelected() {
    if (!selected?.outputs?.length || selectedOutputIds.length === 0) return;
    setActionBusy(true); setNotice("");
    try {
      const targets = selected.outputs.filter((output) => selectedOutputIds.includes(output.assetId));
      for (const output of targets) {
        const url = previewUrls[output.assetId] ?? (await apiRequest<{ url: string }>(`/assets/${output.assetId}/download-url`)).url;
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = output.asset.name;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      }
    } catch (reason) { setNotice(reason instanceof ApiError ? reason.message : "批量下载失败"); }
    finally { setActionBusy(false); }
  }

  return <div className="studio-shell"><StudioSidebar /><main className="workspace platform-page"><header className="assets-header"><div><p className="product-kicker">HISTORY · 生成记录</p><h1>任务历史</h1><p>已使用 {items.length} / 40 条；可查看结果、下载、重新生成或清理历史</p></div></header>{notice && <p className="asset-notice" role="alert">{notice}</p>}{loading ? <section className="asset-loading"><LoaderCircle className="spin" />加载任务历史</section> : items.length === 0 ? <section className="asset-empty"><span className="empty-icon"><History /></span><h2>暂无生成记录</h2><p>提交生成任务后，会在这里跟踪进度与积分状态。</p></section> : <section className="task-list">{items.map((task) => <article className="clickable" key={task.id} onClick={() => void openTask(task)}><span className={`task-state ${task.status.toLowerCase()}`}>{task.status === "SUCCEEDED" ? <CheckCircle2 /> : task.status === "FAILED" ? <XCircle /> : task.status === "CANCELED" ? <Ban /> : <Clock3 />}</span><div><strong>{labels[task.capability] ?? task.capability}</strong><small>{new Date(task.createdAt).toLocaleString("zh-CN")} · 预计 {task.estimatedCredits} 积分</small>{task.errorMessage && <em>{task.errorMessage}</em>}</div><span>{task.status === "QUEUED" ? "排队中" : task.status === "RUNNING" ? `生成中 ${task.progress}%` : task.status === "SUCCEEDED" ? "查看结果" : task.status === "FAILED" ? "查看并重试" : task.status === "CANCELED" ? "已取消" : task.status}</span></article>)}</section>}</main>{selected && <div className="auth-guide-backdrop" onMouseDown={() => setSelected(null)} role="presentation"><section className="task-detail" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><header><div><span>{labels[selected.capability] ?? selected.capability}</span><h2>{selected.status === "SUCCEEDED" ? "生成结果" : selected.status === "FAILED" ? "任务失败" : selected.status === "CANCELED" ? "任务已取消" : "任务详情"}</h2></div><button onClick={() => setSelected(null)} type="button"><X /></button></header>{selected.status === "SUCCEEDED" && (selected.outputs?.length ?? 0) > 0 ? <><div className="task-output-toolbar"><label><input checked={selectedOutputIds.length === selected.outputs!.length} onChange={(event) => setSelectedOutputIds(event.target.checked ? selected.outputs!.map((output) => output.assetId) : [])} type="checkbox" />全选结果</label><button disabled={actionBusy || selectedOutputIds.length === 0} onClick={() => void downloadSelected()} type="button"><DownloadCloud />{selected.outputs!.length > 1 ? `下载已选（${selectedOutputIds.length}）` : "下载结果"}</button></div>{selected.capability === "image_retouche" && inputPreviewUrl ? <div className="retouche-result-compare"><figure><span>精修前</span><img alt="精修前原图" src={inputPreviewUrl} /></figure><figure><span>精修后</span>{previewUrls[selected.outputs![0]!.assetId] ? <img alt="精修后结果" src={previewUrls[selected.outputs![0]!.assetId]} /> : <div><ImageIcon /></div>}</figure></div> : <div className="task-output-grid">{selected.outputs!.map((output) => <article className={selectedOutputIds.includes(output.assetId) ? "selected" : ""} key={output.id}><label className="task-output-select"><input checked={selectedOutputIds.includes(output.assetId)} onChange={() => toggleOutput(output.assetId)} type="checkbox" />选择</label>{previewUrls[output.assetId] ? output.asset.kind === "VIDEO" ? <video controls playsInline preload="metadata" src={previewUrls[output.assetId]} /> : <img alt={output.asset.name} src={previewUrls[output.assetId]} /> : <div><ImageIcon /></div>}<strong className="task-output-name" onClick={() => window.open(previewUrls[output.assetId], "_blank", "noopener,noreferrer")} title="在新窗口打开">{output.asset.name}</strong></article>)}</div>}</> : <section className="task-detail-state">{selected.status === "FAILED" ? <XCircle /> : selected.status === "CANCELED" ? <Ban /> : <LoaderCircle className="spin" />}<strong>{selected.status === "CANCELED" ? "任务已取消" : selected.errorMessage ?? `当前状态：${selected.status}`}</strong><small>{selected.status === "FAILED" || selected.status === "CANCELED" ? "本次冻结积分已自动退回" : `已完成 ${selected.progress}%`}</small></section>}<footer>{selected.status === "QUEUED" ? <button className="danger-action" disabled={actionBusy} onClick={() => void cancelTask(selected)} type="button">{actionBusy ? <LoaderCircle className="spin" /> : <Ban />}取消任务</button> : <button className="danger-action" disabled={actionBusy || selected.status === "RUNNING"} onClick={() => void deleteTask(selected)} type="button"><Trash2 />删除记录</button>}<button className="primary-action" disabled={actionBusy || selected.status === "QUEUED" || selected.status === "RUNNING"} onClick={() => void regenerate(selected)} type="button">{actionBusy ? <LoaderCircle className="spin" /> : <RefreshCcw />}重新生成</button></footer></section></div>}</div>;
}

"use client";

import { useEffect } from "react";
import { Download, ExternalLink, Image as ImageIcon, LoaderCircle, RefreshCcw, Sparkles, X, XCircle } from "lucide-react";

type ImageResultModalProps = {
  open: boolean;
  status: string;
  progress: number;
  title: string;
  inputUrl: string;
  resultUrls: string[];
  errorMessage?: string | null;
  onClose: () => void;
  onAdjust: () => void;
  onViewTasks: () => void;
};

export function ImageResultModal({ open, status, progress, title, inputUrl, resultUrls, errorMessage, onClose, onAdjust, onViewTasks }: ImageResultModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const active = status === "QUEUED" || status === "RUNNING";
  const failed = status === "FAILED" || status === "CANCELED";

  return <div className="result-preview-backdrop" onMouseDown={active ? undefined : onClose} role="presentation">
    <section aria-label={`${title}结果预览`} aria-modal="true" className="result-preview-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <header><div><span>RESULT PREVIEW · 生成结果</span><h2>{title}</h2></div><button aria-label="关闭结果预览" onClick={onClose} type="button"><X /></button></header>
      {active ? <div className="result-preview-loading"><LoaderCircle className="spin" /><strong>{status === "QUEUED" ? "任务正在排队" : "AI 正在生成图片"}</strong><p>可以关闭窗口继续浏览，任务会在后台继续执行。</p><div><i style={{ width: `${Math.max(4, progress)}%` }} /></div><small>{Math.max(0, progress)}%</small></div>
      : failed ? <div className="result-preview-failed"><XCircle /><strong>{status === "CANCELED" ? "任务已取消" : "生成失败"}</strong><p>{errorMessage ?? "本次任务未能完成，冻结积分已自动退回。"}</p></div>
      : <div className={`result-preview-compare ${resultUrls.length > 1 ? "multiple" : ""}`}><figure><figcaption><ImageIcon />生成前</figcaption>{inputUrl ? <img alt="生成前原图" src={inputUrl} /> : <div><ImageIcon /></div>}</figure><figure><figcaption><Sparkles />生成结果<em>{resultUrls.length} 张</em></figcaption>{resultUrls.length ? <div className="result-preview-output-grid">{resultUrls.map((url, index) => <button key={url} onClick={() => window.open(url, "_blank", "noopener,noreferrer")} type="button"><img alt={`AI 生成结果 ${index + 1}`} src={url} /><span><ExternalLink />查看第 {index + 1} 张</span></button>)}</div> : <div><ImageIcon /></div>}</figure></div>}
      <footer><button className="secondary-action" onClick={onViewTasks} type="button">查看任务详情</button><div><button className="secondary-action" disabled={active} onClick={onAdjust} type="button"><RefreshCcw />调整后再生成</button><button className="primary-action" disabled={!resultUrls.length} onClick={() => resultUrls.forEach((url, index) => window.setTimeout(() => window.open(url, "_blank", "noopener,noreferrer"), index * 180))} type="button"><Download />{resultUrls.length > 1 ? `下载全部（${resultUrls.length}）` : "下载结果"}</button></div></footer>
    </section>
  </div>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, FileAudio, FileVideo, FolderOpen, Image as ImageIcon, ImageOff, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { apiRequest, ApiError, type Asset } from "../lib/api";

type PickerKind = "IMAGE" | "VIDEO" | "AUDIO";
type AssetPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (asset: Asset, previewUrl: string) => void;
  kind?: PickerKind;
};

const KIND_TEXT: Record<PickerKind, { title: string; hint: string; empty: string; emptyHint: string }> = {
  IMAGE: { title: "从资产库选择", hint: "单选一张图片作为输入素材", empty: "资产库还没有图片", emptyHint: "可先通过本地上传，或前往资产页上传素材。" },
  VIDEO: { title: "从资产库选择视频", hint: "单选一个视频作为输入素材", empty: "资产库还没有视频", emptyHint: "可先在任务历史中生成视频，或前往资产页上传。" },
  AUDIO: { title: "从资产库选择音频", hint: "单选一段音频作为输入素材", empty: "资产库还没有音频", emptyHint: "可先在任务历史中生成音频，或前往资产页上传。" },
};

function sourceLabel(asset: Asset) {
  return asset.source === "AI_GENERATED" ? "AI 生成" : "上传素材";
}

export function AssetPickerModal({ open, onClose, onConfirm, kind = "IMAGE" }: AssetPickerModalProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const text = KIND_TEXT[kind];

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<{ items: Asset[] }>(`/assets?kind=${kind}&pageSize=50`);
      setAssets(result.items);
      const entries = await Promise.allSettled(result.items.map(async (asset) => {
        const download = await apiRequest<{ url: string }>(`/assets/${asset.id}/download-url`);
        return [asset.id, download.url] as const;
      }));
      setPreviewUrls(Object.fromEntries(entries.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : [])));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "资产加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedId(null);
    setConfirming(false);
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const visibleAssets = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return assets;
    return assets.filter((asset) => asset.name.toLowerCase().includes(keyword));
  }, [assets, search]);

  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  async function confirm() {
    if (!selected || confirming) return;
    setConfirming(true);
    try {
      const url = previewUrls[selected.id] ?? (await apiRequest<{ url: string }>(`/assets/${selected.id}/download-url`)).url;
      onConfirm(selected, url);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "图片地址获取失败，请重试");
    } finally {
      setConfirming(false);
    }
  }

  if (!open) return null;

  return <div className="picker-overlay" onClick={onClose} role="presentation">
    <div aria-label="从资产库选择素材" aria-modal="true" className="picker-modal" onClick={(event) => event.stopPropagation()} role="dialog">
      <header className="picker-header">
        <strong>{text.title}</strong>
        <small>{text.hint}</small>
        <button aria-label="关闭" onClick={onClose} type="button"><X /></button>
      </header>
      <div className="picker-toolbar">
        <label className="asset-search picker-search"><Search aria-hidden="true" /><input aria-label="搜索资产名称" onChange={(event) => setSearch(event.target.value)} placeholder="搜索资产名称" value={search} /></label>
        <span className="picker-count">{visibleAssets.length} 项</span>
      </div>
      {error && <p className="asset-notice picker-notice" role="alert">{error}<button onClick={() => void load()} type="button"><RefreshCw />重试</button></p>}
      <div className="picker-body">
        {loading ? <div className="asset-loading picker-loading"><LoaderCircle className="spin" aria-hidden="true" />正在加载资产</div>
        : visibleAssets.length === 0 ? <div className="picker-empty">
            <span className="empty-icon"><FolderOpen aria-hidden="true" /></span>
            <h3>{search ? "没有匹配的资产" : text.empty}</h3>
            <p>{search ? "换一个关键词试试。" : text.emptyHint}</p>
          </div>
        : <div className="picker-grid">{visibleAssets.map((asset) => {
            const url = previewUrls[asset.id];
            const isSelected = asset.id === selectedId;
            return <button aria-pressed={isSelected} className={`picker-card ${isSelected ? "selected" : ""}`} key={asset.id} onClick={() => setSelectedId(asset.id)} type="button">
              <span className="picker-thumb">{kind === "IMAGE" && url ? <img alt={asset.name} loading="lazy" src={url} /> : kind === "VIDEO" ? <FileVideo aria-hidden="true" /> : kind === "AUDIO" ? <FileAudio aria-hidden="true" /> : <ImageOff aria-hidden="true" />}<em>{sourceLabel(asset)}</em>{isSelected && <i className="picker-check"><Check aria-hidden="true" /></i>}</span>
              <strong title={asset.name}>{asset.name}</strong>
            </button>;
          })}</div>}
      </div>
      <footer className="picker-footer">
        <button className="picker-cancel" onClick={onClose} type="button">取消</button>
        <button className="picker-confirm" disabled={!selected || confirming} onClick={() => void confirm()} type="button">{confirming ? "正在确认…" : selected ? `确认选择「${selected.name.length > 12 ? `${selected.name.slice(0, 12)}…` : selected.name}」` : kind === "IMAGE" ? "请选择一张图片" : kind === "VIDEO" ? "请选择一段视频" : "请选择一段音频"}</button>
      </footer>
    </div>
  </div>;
}

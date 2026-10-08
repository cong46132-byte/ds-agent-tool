"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { apiRequest, ApiError } from "../../lib/api";
import { FALLBACK_GENERATION_DEFAULTS, type CapabilityDefaults, type PlatformCatalog } from "../../lib/generation-defaults";
import type { CanvasNode } from "../../lib/canvas-types";

const IMAGE_CAPABILITIES: Array<{ key: string; label: string }> = [
  { key: "product_detail_set", label: "商详套图" },
  { key: "product_white_background", label: "商品白底图" },
  { key: "image_retouche", label: "图片精修" },
  { key: "virtual_try_on", label: "服装上身" },
  { key: "clothing_redesign", label: "服装改款" },
  { key: "product_use", label: "商品使用" },
];
const VIDEO_CAPABILITIES: Array<{ key: string; label: string }> = [
  { key: "director_video", label: "超级编导" },
  { key: "video_recreation", label: "深度复刻" },
];

const IMAGE_FALLBACK: CapabilityDefaults = { model: FALLBACK_GENERATION_DEFAULTS.imageModel, ratio: "1:1", resolution: FALLBACK_GENERATION_DEFAULTS.imageResolution, format: FALLBACK_GENERATION_DEFAULTS.imageFormat, count: 1 };
const VIDEO_FALLBACK: CapabilityDefaults = { model: FALLBACK_GENERATION_DEFAULTS.videoModel, ratio: FALLBACK_GENERATION_DEFAULTS.videoRatio, resolution: FALLBACK_GENERATION_DEFAULTS.videoResolution, duration: FALLBACK_GENERATION_DEFAULTS.videoDuration, format: "MP4", count: 1 };

type NodeGenerationPanelProps = {
  node: CanvasNode;
  upstream: CanvasNode[];
  anchor: { x: number; y: number };
  onClose: () => void;
  onSubmitted: (taskId: string) => void;
  onSubmitError: (message: string) => void;
  onNotice: (message: string) => void;
};

export function NodeGenerationPanel({ node, upstream, anchor, onClose, onSubmitted, onSubmitError, onNotice }: NodeGenerationPanelProps) {
  const candidates = node.kind === "video" ? VIDEO_CAPABILITIES : IMAGE_CAPABILITIES;
  const [options, setOptions] = useState<Array<{ key: string; label: string; defaults: CapabilityDefaults }>>(candidates.map((item) => ({ ...item, defaults: node.kind === "video" ? VIDEO_FALLBACK : IMAGE_FALLBACK })));
  const [capability, setCapability] = useState(candidates[0]!.key);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<PlatformCatalog>("/platform/catalog").then((catalog) => {
      const resolved = candidates
        .map((item) => ({ ...item, defaults: catalog.defaults[item.key] }))
        .filter((item): item is { key: string; label: string; defaults: CapabilityDefaults } => Boolean(item.defaults))
        .map((item) => ({ ...item, defaults: { ...item.defaults } }));
      if (resolved.length) setOptions(resolved);
    }).catch(() => undefined);
  }, [node.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selected = options.find((item) => item.key === capability) ?? options[0]!;
  const defaults = selected.defaults;
  const textUpstreams = useMemo(() => upstream.filter((item) => item.kind === "text" && item.text?.trim()), [upstream]);
  const assetUpstreamIds = useMemo(() => [...new Set(upstream.filter((item) => (item.kind === "image" || item.kind === "video") && item.assetId).map((item) => item.assetId!))], [upstream]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    let assetIds = assetUpstreamIds;
    if (assetIds.length > 10) {
      assetIds = assetIds.slice(0, 10);
      onNotice("上游素材超过 10 项，仅引用前 10 项");
    }
    const context = textUpstreams.map((item) => `【${item.title ?? "文本节点"}】\n${item.text}`).join("\n\n");
    const finalPrompt = context ? `${context}\n\n${prompt.trim()}` : prompt.trim();
    try {
      const task = await apiRequest<{ id: string }>("/tasks", { method: "POST", body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        capability: selected.key,
        assetIds,
        prompt: finalPrompt,
        parameters: { model: defaults.model, ratio: defaults.ratio, resolution: defaults.resolution, format: defaults.format, ...(defaults.duration ? { duration: defaults.duration } : {}), count: defaults.count },
      }) });
      onSubmitted(task.id);
    } catch (reason) {
      const message = reason instanceof ApiError ? `${reason.message}${reason.code && reason.code !== "REQUEST_FAILED" ? `（${reason.code}）` : ""}` : "任务提交失败，请稍后重试";
      setError(message);
      onSubmitError(message);
      setBusy(false);
    }
  }

  return <div className="gen-panel" role="dialog" aria-modal="true" aria-label={`${node.title ?? "节点"} 生成设置`} style={{ left: anchor.x, top: anchor.y }}>
    <header><strong>生成 · {node.title || "节点"}</strong><button aria-label="关闭" onClick={onClose} type="button"><X /></button></header>
    <label className="gen-field">生成能力<select onChange={(event) => setCapability(event.target.value)} value={selected.key}>{options.map((item) => <option key={item.key} value={item.key}>{item.label} · {item.key}</option>)}</select></label>
    <label className="gen-field">生成要求<textarea autoFocus maxLength={4000} onChange={(event) => setPrompt(event.target.value)} placeholder="描述想要的内容，AI 将结合上游素材与文案生成…" value={prompt} /></label>
    <p className="gen-context"><AlertTriangle aria-hidden="true" />将自动带上 {assetUpstreamIds.length} 个上游素材{textUpstreams.length ? `，已包含 ${textUpstreams.length} 个上游文本节点的文案作为上下文` : ""}</p>
    <div className="gen-params"><span>模型 {defaults.model}</span><span>比例 {defaults.ratio}</span><span>分辨率 {defaults.resolution}</span><span>格式 {defaults.format}</span>{defaults.duration && <span>时长 {defaults.duration}</span>}<span>数量 {defaults.count}</span></div>
    {error && <p className="gen-error" role="alert">{error}</p>}
    <footer><button className="picker-cancel" onClick={onClose} type="button">取消</button><button className="picker-confirm" disabled={busy} onClick={() => void submit()} type="button">{busy ? <LoaderCircle className="spin" /> : null}{busy ? "正在提交…" : "开始生成"}</button></footer>
  </div>;
}

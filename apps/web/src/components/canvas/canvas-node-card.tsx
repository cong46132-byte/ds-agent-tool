"use client";

import { PointerEvent as ReactPointerEvent, useEffect, useState } from "react";
import { AlertTriangle, FolderOpen, Image as ImageIcon, RefreshCw, Sparkles, Type, Video, Volume2, X, type LucideIcon } from "lucide-react";
import type { CanvasNode, NodeKind } from "../../lib/canvas-types";

export const KIND_ICON: Record<NodeKind, LucideIcon> = { text: Type, image: ImageIcon, video: Video, audio: Volume2 };
export const KIND_LABEL: Record<NodeKind, string> = { text: "文本节点", image: "图片节点", video: "视频节点", audio: "音频节点" };

type CanvasNodeCardProps = {
  node: CanvasNode;
  stale: boolean;
  selected: boolean;
  editingText: boolean;
  onDragStart: (event: ReactPointerEvent, node: CanvasNode) => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CanvasNode>, bumpRev?: boolean) => void;
  onRemove: (id: string) => void;
  onStartDraft: (event: ReactPointerEvent, node: CanvasNode) => void;
  onFinishDraft: (nodeId: string) => void;
  onPickAsset: (node: CanvasNode) => void;
  onOpenGeneration: (node: CanvasNode) => void;
  onBeginTextEdit: (id: string) => void;
  onEndTextEdit: (id: string, value: string) => void;
  onCancelTextEdit: () => void;
};

export function CanvasNodeCard({ node, stale, selected, editingText, onDragStart, onSelect, onUpdate, onRemove, onStartDraft, onFinishDraft, onPickAsset, onOpenGeneration, onBeginTextEdit, onEndTextEdit, onCancelTextEdit }: CanvasNodeCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [textDraft, setTextDraft] = useState("");
  const Icon = KIND_ICON[node.kind];
  const busy = node.status === "QUEUED" || node.status === "RUNNING";

  useEffect(() => {
    if (editingText) setTextDraft(node.text ?? "");
  }, [editingText, node.text]);

  function commitTitle() {
    setEditingTitle(false);
    const next = titleDraft.trim();
    if (next && next !== node.title) onUpdate(node.id, { title: next }, true);
  }

  function beginTitleEdit(event: React.MouseEvent) {
    event.stopPropagation();
    setTitleDraft(node.title ?? KIND_LABEL[node.kind]);
    setEditingTitle(true);
  }

  function titleOverlay() {
    return editingTitle
      ? <input aria-label="节点名称" autoFocus className="node-float-input" onBlur={commitTitle} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitTitle(); if (event.key === "Escape") setEditingTitle(false); }} onPointerDown={(event) => event.stopPropagation()} value={titleDraft} />
      : <span className="node-float-title" onDoubleClick={beginTitleEdit} title="双击修改名称">{node.title || KIND_LABEL[node.kind]}</span>;
  }

  if (node.kind === "text") {
    return <article className={`canvas-node text${selected ? " selected" : ""}`} onPointerDown={(event) => { onDragStart(event, node); onSelect(node.id); }} style={{ left: node.x, top: node.y }}>
      <header>
        <Icon aria-hidden="true" />
        {editingTitle
          ? <input aria-label="节点名称" autoFocus className="node-title-input" onBlur={commitTitle} onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitTitle(); if (event.key === "Escape") setEditingTitle(false); }} onPointerDown={(event) => event.stopPropagation()} value={titleDraft} />
          : <span onDoubleClick={(event) => { event.stopPropagation(); setTitleDraft(node.title ?? KIND_LABEL[node.kind]); setEditingTitle(true); }} title="双击修改名称">{node.title || KIND_LABEL[node.kind]}</span>}
        <button aria-label={`删除节点 ${node.title ?? ""}`} onClick={() => onRemove(node.id)} onPointerDown={(event) => event.stopPropagation()} type="button"><X /></button>
      </header>
      {busy && <div className="node-progress" role="progressbar" aria-valuenow={node.progress ?? 0}><i style={{ width: `${node.progress ?? 0}%` }} /><em>{node.status === "QUEUED" ? "排队中" : `生成中 ${node.progress ?? 0}%`}</em></div>}
      {node.status === "FAILED" && !busy && <p className="node-error" title={node.error ?? ""}><AlertTriangle aria-hidden="true" />{node.error || "生成失败"}</p>}
      {editingText
        ? <textarea aria-label="节点文本" autoFocus className="node-text-edit" onBlur={() => onEndTextEdit(node.id, textDraft)} onChange={(event) => setTextDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onCancelTextEdit(); }} onPointerDown={(event) => event.stopPropagation()} value={textDraft} />
        : <p className="node-text" onDoubleClick={(event) => { event.stopPropagation(); onBeginTextEdit(node.id); }} title="双击编辑文本">{node.text || "双击输入文本内容"}</p>}
      {node.sources?.length ? <small className="node-sources">来自 {node.sources.join("、")}</small> : null}
      <i className="port in" onPointerUp={() => onFinishDraft(node.id)} />
      <i className="port out" onPointerDown={(event) => onStartDraft(event, node)} />
    </article>;
  }

  return <article className={`canvas-node media ${node.kind}${selected ? " selected" : ""}${busy ? " busy" : ""}`} onPointerDown={(event) => { onDragStart(event, node); onSelect(node.id); }} style={{ left: node.x, top: node.y }}>
    <div className="node-fill">
      {node.kind === "image" ? (node.assetId ? (node.mediaUrl ? <img alt={node.assetName ?? "节点图片"} src={node.mediaUrl} /> : <div className="node-media-loading">正在加载图片…</div>) : <div className="node-fill-empty"><ImageIcon aria-hidden="true" /><span>图片</span></div>)
        : node.kind === "video" ? (node.assetId ? (node.mediaUrl ? <video controls disablePictureInPicture preload="metadata" src={node.mediaUrl} /> : <div className="node-media-loading">正在加载视频…</div>) : <div className="node-fill-empty"><Video aria-hidden="true" /><span>视频</span></div>)
        : node.assetId ? <div className="node-audio-fill"><Volume2 aria-hidden="true" /><audio controls preload="metadata" src={node.mediaUrl ?? undefined} /></div> : <div className="node-audio-fill"><Volume2 aria-hidden="true" /><i className="node-wave" /><span style={{ color: "#9a9281", fontSize: 8 }}>音频</span></div>}
      {titleOverlay()}
      <button aria-label={`删除节点 ${node.title ?? ""}`} className="node-float-close" onClick={() => onRemove(node.id)} onPointerDown={(event) => event.stopPropagation()} type="button"><X /></button>
      {busy && <div className="node-fill-progress" role="progressbar" aria-valuenow={node.progress ?? 0}><i style={{ width: `${node.progress ?? 0}%` }} /></div>}
      {node.status === "FAILED" && !busy && <span className="node-fill-error" title={node.error ?? ""}><AlertTriangle aria-hidden="true" />{node.error || "生成失败"}</span>}
      {stale && <button className="node-fill-stale" onClick={() => onOpenGeneration(node)} onPointerDown={(event) => event.stopPropagation()} type="button"><RefreshCw aria-hidden="true" />上游已变更 · 重新生成</button>}
    </div>
    {node.assetName && <small className="node-asset-name" title={node.assetName}>{node.assetName}</small>}
    {node.sources?.length ? <small className="node-sources">来自 {node.sources.join("、")}</small> : null}
    {!node.assetId && <div className="node-empty">
      <small>{node.text || "引用资产库素材，或在节点内发起 AI 生成"}</small>
      <div><button onClick={() => onPickAsset(node)} onPointerDown={(event) => event.stopPropagation()} type="button"><FolderOpen aria-hidden="true" />资产库</button>{node.kind !== "audio" && <button onClick={() => onOpenGeneration(node)} onPointerDown={(event) => event.stopPropagation()} type="button"><Sparkles aria-hidden="true" />生成</button>}</div>
    </div>}
    <i className="port in" onPointerUp={() => onFinishDraft(node.id)} />
    <i className="port out" onPointerDown={(event) => onStartDraft(event, node)} />
  </article>;
}

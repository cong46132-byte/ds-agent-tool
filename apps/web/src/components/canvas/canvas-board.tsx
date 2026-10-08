"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Download, Eraser, FolderOpen, Image as ImageIcon, LoaderCircle, Minus, PenLine, Plus, Sparkles, Trash2, Type, Video, Volume2, X } from "lucide-react";
import { StudioSidebar } from "../studio-sidebar";
import { AssetPickerModal } from "../asset-picker-modal";
import { CanvasNodeCard, KIND_LABEL } from "./canvas-node-card";
import { CanvasMinimap } from "./canvas-minimap";
import { NodeGenerationPanel } from "./node-generation-panel";
import { apiRequest, ApiError, updateCanvas, type CanvasConnection, type CanvasContent, type CanvasNode, type CanvasResponse } from "../../lib/api";
import { collectDownstream, createNodeId, hasConnection, NODE_ANCHOR_Y, NODE_KINDS, NODE_WIDTH, TERMINAL_STATUSES, wouldCreateCycle, type NodeKind } from "../../lib/canvas-types";
import { exportCanvasPdf, exportCanvasPng } from "../../lib/canvas-export";

type TaskDetail = {
  id: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  outputs?: Array<{ assetId: string; asset: { id: string; name: string; kind: string } }>;
};

const KIND_ICON = { text: Type, image: ImageIcon, video: Video, audio: Volume2 } as const;
const ADD_LABEL: Record<NodeKind, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };
const clampZoom = (value: number) => Math.min(2, Math.max(0.25, value));

export function CanvasBoard({ canvas }: { canvas: CanvasResponse }) {
  const [name, setName] = useState(canvas.name);
  const [savedName, setSavedName] = useState(canvas.name);
  const [nodes, setNodes] = useState<CanvasNode[]>(canvas.content?.nodes ?? []);
  const [connections, setConnections] = useState<CanvasConnection[]>(canvas.content?.connections ?? []);
  const [zoom, setZoom] = useState(canvas.content?.zoom ?? 1);
  const [pan, setPan] = useState(canvas.content?.pan ?? { x: 0, y: 0 });
  const [staleIds, setStaleIds] = useState<Set<string>>(new Set());
  const [selectedEdge, setSelectedEdge] = useState<CanvasConnection | null>(null);
  const [draft, setDraftState] = useState<{ from: string; x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<{ phase: "idle" | "saving" | "saved"; time: string }>({ phase: "idle", time: "" });
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);
  const [genNodeId, setGenNodeId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [hintVisible, setHintVisible] = useState(() => typeof window !== "undefined" && sessionStorage.getItem("canvas_brand_hint_closed") !== "1");

  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ type: "node" | "pan"; id?: string; startX: number; startY: number; originX: number; originY: number; zoom: number } | null>(null);
  const draftRef = useRef<{ from: string; x: number; y: number } | null>(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  const selectedEdgeRef = useRef<CanvasConnection | null>(null);
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const noticeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { selectedEdgeRef.current = selectedEdge; }, [selectedEdge]);

  useEffect(() => {
    function measureBoard() {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) setBoardSize({ width: rect.width, height: rect.height });
    }
    measureBoard();
    window.addEventListener("resize", measureBoard);
    return () => window.removeEventListener("resize", measureBoard);
  }, []);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function setDraft(next: { from: string; x: number; y: number } | null) {
    draftRef.current = next;
    setDraftState(next);
  }

  function showNotice(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3200);
  }

  const updateNode = useCallback((id: string, patch: Partial<CanvasNode>, bumpRev = false) => {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...patch, ...(bumpRev ? { contentRev: node.contentRev + 1 } : {}) } : node)));
    if (bumpRev) {
      const downstream = collectDownstream(id, connectionsRef.current);
      if (downstream.size) setStaleIds((current) => new Set([...current, ...downstream]));
    }
  }, []);

  function removeNode(id: string) {
    setNodes((current) => current.filter((node) => node.id !== id));
    setConnections((current) => current.filter((edge) => edge.from !== id && edge.to !== id));
    setStaleIds((current) => { const next = new Set(current); next.delete(id); return next; });
    if (selectedEdgeRef.current && (selectedEdgeRef.current.from === id || selectedEdgeRef.current.to === id)) setSelectedEdge(null);
    setSelectedNodeId((current) => (current === id ? null : current));
    setEditingTextNodeId((current) => (current === id ? null : current));
  }

  function clearCanvas() {
    if (!nodes.length || !window.confirm("清空画布中的所有节点与连线？此操作可通过刷新撤销（未保存前不会写入）。")) return;
    setNodes([]);
    setConnections([]);
    setStaleIds(new Set());
    setSelectedNodeId(null);
    setEditingTextNodeId(null);
    setSelectedEdge(null);
  }

  function beginTextEdit(id: string) {
    setSelectedNodeId(id);
    setEditingTextNodeId(id);
  }
  function endTextEdit(id: string, value: string) {
    setEditingTextNodeId(null);
    const node = nodesRef.current.find((item) => item.id === id);
    if (node && value !== (node.text ?? "")) updateNode(id, { text: value }, true);
  }
  function cancelTextEdit() {
    setEditingTextNodeId(null);
  }

  function toCanvasPoint(clientX: number, clientY: number) {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }

  function addNode(kind: NodeKind) {
    const rect = boardRef.current?.getBoundingClientRect();
    const center = rect ? toCanvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: 300, y: 200 };
    const jitter = nodes.length * 14;
    const node: CanvasNode = {
      id: createNodeId(),
      kind,
      x: Math.round(center.x - NODE_WIDTH / 2 + jitter) ,
      y: Math.round(center.y - 50 + jitter),
      title: KIND_LABEL[kind],
      text: kind === "text" ? "" : kind === "image" ? "从资产库选择图片，或点击生成" : kind === "video" ? "从资产库选择视频，或点击生成" : "从资产库选择配音或音乐",
      assetId: null,
      assetName: null,
      mediaUrl: null,
      taskId: null,
      contentRev: 1,
    };
    setNodes((current) => [...current, node]);
  }

  // ---- 交互：节点拖拽 / 平移 ----
  function startNodeDrag(event: ReactPointerEvent, node: CanvasNode) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { type: "node", id: node.id, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y, zoom };
  }
  function startPan(event: ReactPointerEvent) {
    const target = event.target as Element;
    if (target.closest?.(".canvas-node, .port, .canvas-edges path, button, input, textarea, select, a, video, audio")) return;
    setSelectedEdge(null);
    setSelectedNodeId(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { type: "pan", startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y, zoom };
  }
  function onPointerMove(event: ReactPointerEvent) {
    if (draftRef.current) {
      const point = toCanvasPoint(event.clientX, event.clientY);
      setDraft({ ...draftRef.current, x: point.x, y: point.y });
      return;
    }
    const active = dragRef.current;
    if (!active) return;
    const dx = event.clientX - active.startX, dy = event.clientY - active.startY;
    if (active.type === "pan") setPan({ x: active.originX + dx, y: active.originY + dy });
    else if (active.id) {
      const id = active.id;
      setNodes((current) => current.map((node) => (node.id === id ? { ...node, x: active.originX + dx / active.zoom, y: active.originY + dy / active.zoom } : node)));
    }
  }
  function onPointerUp() {
    dragRef.current = null;
    if (draftRef.current) setDraft(null);
  }

  // ---- 连线：拖出 / 建立 / 删除 ----
  function startDraft(event: ReactPointerEvent, node: CanvasNode) {
    event.stopPropagation();
    const point = toCanvasPoint(event.clientX, event.clientY);
    setDraft({ from: node.id, x: point.x, y: point.y });
  }
  function finishDraft(targetId: string) {
    const active = draftRef.current;
    if (!active) return;
    const from = active.from;
    setDraft(null);
    if (from === targetId) return;
    if (hasConnection(connectionsRef.current, from, targetId)) return void showNotice("两个节点之间已存在引用关系");
    if (wouldCreateCycle(from, targetId, connectionsRef.current)) return void showNotice("不能建立会形成环路的连接");
    setConnections((current) => [...current, { from, to: targetId }]);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (draftRef.current) setDraft(null);
        setExportOpen(false);
        setSelectedNodeId(null);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target as Element;
        if (target.closest?.("input, textarea, select")) return;
        const edge = selectedEdgeRef.current;
        if (!edge) return;
        event.preventDefault();
        setConnections((current) => current.filter((item) => !(item.from === edge.from && item.to === edge.to)));
        setSelectedEdge(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---- 自动保存（debounce 1.5s）----
  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      // mediaUrl 是 10 分钟有效的临时签名地址，不落库，重新打开画布时统一重新获取
      const content: CanvasContent = { nodes: nodes.map((node) => (node.assetId ? { ...node, mediaUrl: null } : node)), connections, zoom, pan };
      setSaveState({ phase: "saving", time: "" });
      updateCanvas(canvas.id, { content })
        .then(() => setSaveState({ phase: "saved", time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }))
        .catch(() => { setSaveState({ phase: "idle", time: "" }); showNotice("自动保存失败，请检查网络后重试"); });
    }, 1500);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [nodes, connections, zoom, pan, canvas.id]);

  async function commitName() {
    const next = name.trim();
    if (!next || next === savedName) return;
    try { await updateCanvas(canvas.id, { name: next }); setSavedName(next); setSaveState({ phase: "saved", time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) }); }
    catch (reason) { showNotice(reason instanceof ApiError ? reason.message : "画布名保存失败"); }
  }

  // ---- 加载时批量补齐临时媒体地址 ----
  useEffect(() => {
    const missing = nodesRef.current.filter((node) => node.assetId);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.allSettled(missing.map(async (node) => [node.id, (await apiRequest<{ url: string }>(`/assets/${node.assetId}/download-url`)).url] as const))
      .then((entries) => {
        if (cancelled) return;
        const map = new Map(entries.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : [])));
        if (map.size) setNodes((current) => current.map((node) => (map.has(node.id) ? { ...node, mediaUrl: map.get(node.id)! } : node)));
      });
    return () => { cancelled = true; };
  }, []);

  // ---- 任务轮询：节点内生成进度与结果回填 ----
  async function pollTask(nodeId: string, taskId: string) {
    try {
      const task = await apiRequest<TaskDetail>(`/tasks/${taskId}`);
      if (task.status === "SUCCEEDED") {
        const output = task.outputs?.[0];
        if (output) {
          const download = await apiRequest<{ url: string }>(`/assets/${output.assetId}/download-url`).catch(() => null);
          const sources = connectionsRef.current
            .filter((edge) => edge.to === nodeId)
            .map((edge) => nodesRef.current.find((node) => node.id === edge.from)?.title)
            .filter((title): title is string => Boolean(title));
          const patch: Partial<CanvasNode> = { taskId: null, status: "SUCCEEDED", progress: 100, error: null, assetId: output.assetId, assetName: output.asset.name, mediaUrl: download?.url ?? null };
          if (sources.length) patch.sources = sources;
          updateNode(nodeId, patch, true);
          setStaleIds((current) => { const next = new Set(current); next.delete(nodeId); return next; });
        } else {
          updateNode(nodeId, { taskId: null, status: "SUCCEEDED", progress: 100, error: null });
        }
      } else if (task.status === "FAILED" || task.status === "CANCELED") {
        updateNode(nodeId, { taskId: null, status: task.status, error: task.errorMessage ?? (task.status === "CANCELED" ? "任务已取消" : "生成失败") });
      } else {
        updateNode(nodeId, { status: task.status as "QUEUED" | "RUNNING", progress: task.progress });
      }
    } catch { /* 网络异常时下一轮继续轮询 */ }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const node of nodesRef.current) {
        if (node.taskId && !TERMINAL_STATUSES.has(node.status ?? "")) void pollTask(node.id, node.taskId);
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [updateNode]);

  // ---- 导出 ----
  async function runExport(format: "png" | "pdf") {
    setExportOpen(false);
    if (exporting) return;
    setExporting(true);
    try {
      const content: CanvasContent = { nodes, connections, zoom, pan };
      const exportName = name.trim() || "画布";
      const { skipped } = format === "png" ? await exportCanvasPng(content, exportName) : await exportCanvasPdf(content, exportName);
      showNotice(skipped ? `已导出 ${format.toUpperCase()}，${skipped} 张图片加载失败已用占位框代替` : `已导出 ${format.toUpperCase()}（全部内容，不截断）`);
    } catch (reason) {
      showNotice(reason instanceof Error ? reason.message : "导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }

  const pickerNode = pickerNodeId ? nodeMap.get(pickerNodeId) : undefined;
  const genNode = genNodeId ? nodeMap.get(genNodeId) : undefined;
  const genUpstream = useMemo(() => (genNode ? connections.filter((edge) => edge.to === genNode.id).map((edge) => nodeMap.get(edge.from)).filter((node): node is CanvasNode => Boolean(node)) : []), [genNode, connections, nodeMap]);
  const genAnchor = (() => {
    if (!genNode) return { x: 0, y: 0 };
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: 80, y: 120 };
    return {
      x: Math.max(12, Math.min(rect.left + genNode.x * zoom + pan.x, window.innerWidth - 348)),
      y: Math.max(70, rect.top + genNode.y * zoom + pan.y),
    };
  })();
  const quickNode = selectedNodeId ? nodeMap.get(selectedNodeId) : undefined;
  const quickPos = (() => {
    if (!quickNode) return null;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(90, Math.min(rect.left + (quickNode.x + NODE_WIDTH / 2) * zoom + pan.x, window.innerWidth - 90)),
      y: rect.top + quickNode.y * zoom + pan.y,
    };
  })();
  function navigateTo(worldX: number, worldY: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPan({ x: rect.width / 2 - worldX * zoom, y: rect.height / 2 - worldY * zoom });
  }

  return <div className="canvas-shell"><StudioSidebar />
    <header className="canvas-banner canvas-topbar">
      <Link className="canvas-back" href="/canvas"><ArrowLeft aria-hidden="true" />画布</Link>
      <input aria-label="画布名称" className="canvas-name-input" maxLength={40} onBlur={() => void commitName()} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} value={name} />
      <span className="canvas-save-state">{saveState.phase === "saving" ? "保存中…" : saveState.phase === "saved" ? `已保存 ${saveState.time}` : ""}</span>
      <div className="export-wrap">
        <button className="canvas-export-button" disabled={exporting} onClick={() => setExportOpen((open) => !open)} type="button">{exporting ? <LoaderCircle className="spin" /> : <Download aria-hidden="true" />}导出<ChevronDown aria-hidden="true" /></button>
        {exportOpen && <div className="export-menu"><button onClick={() => void runExport("png")} type="button"><ImageIcon aria-hidden="true" />PNG · 全部内容</button><button onClick={() => void runExport("pdf")} type="button"><Download aria-hidden="true" />PDF · 全部内容</button></div>}
      </div>
    </header>
    {hintVisible && <div className="canvas-brand-hint"><Sparkles aria-hidden="true" /><p>一块画布，连接创意、素材与成片，让 AI 创作真正进入工作流。</p><button aria-label="关闭提示" onClick={() => { setHintVisible(false); sessionStorage.setItem("canvas_brand_hint_closed", "1"); }} type="button"><X aria-hidden="true" /></button></div>}
    <aside className="node-toolbar slim">{NODE_KINDS.map((kind) => { const Icon = KIND_ICON[kind]; return <button data-tip={`添加${ADD_LABEL[kind]}节点`} key={kind} onClick={() => addNode(kind)} type="button"><Icon /></button>; })}<i /><button data-tip="清空画布" onClick={clearCanvas} type="button"><Eraser /></button></aside>
    <div className="infinite-board" onPointerDown={startPan} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={(event) => {
      event.preventDefault();
      const rect = boardRef.current!.getBoundingClientRect();
      const px = event.clientX - rect.left, py = event.clientY - rect.top;
      const next = clampZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1));
      setPan({ x: px - (px - pan.x) * (next / zoom), y: py - (py - pan.y) * (next / zoom) });
      setZoom(next);
    }} ref={boardRef}>
      <div className="canvas-surface" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="canvas-edges">
          {connections.map((edge) => {
            const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_ANCHOR_Y, x2 = to.x, y2 = to.y + NODE_ANCHOR_Y;
            const isSelected = selectedEdge?.from === edge.from && selectedEdge?.to === edge.to;
            return <path className={isSelected ? "selected" : ""} d={`M ${x1} ${y1} C ${x1 + 75} ${y1}, ${x2 - 75} ${y2}, ${x2} ${y2}`} key={`${edge.from}-${edge.to}`} onClick={(event) => { event.stopPropagation(); setSelectedEdge(edge); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setConnections((current) => current.filter((item) => !(item.from === edge.from && item.to === edge.to))); setSelectedEdge(null); }} style={{ pointerEvents: "stroke", cursor: "pointer" }} />;
          })}
          {draft && (() => {
            const from = nodeMap.get(draft.from);
            if (!from) return null;
            const x1 = from.x + NODE_WIDTH, y1 = from.y + NODE_ANCHOR_Y;
            return <path className="drafting" d={`M ${x1} ${y1} C ${x1 + 75} ${y1}, ${draft.x - 75} ${draft.y}, ${draft.x} ${draft.y}`} />;
          })()}
        </svg>
        {nodes.map((node) => <CanvasNodeCard key={node.id} node={node} stale={staleIds.has(node.id)} selected={selectedNodeId === node.id} editingText={editingTextNodeId === node.id} onBeginTextEdit={beginTextEdit} onCancelTextEdit={cancelTextEdit} onDragStart={startNodeDrag} onEndTextEdit={endTextEdit} onFinishDraft={finishDraft} onOpenGeneration={(target) => setGenNodeId(target.id)} onPickAsset={(target) => setPickerNodeId(target.id)} onRemove={removeNode} onSelect={setSelectedNodeId} onStartDraft={startDraft} onUpdate={updateNode} />)}
      </div>
    </div>
    {quickPos && quickNode && <div className="quick-bar" style={{ left: quickPos.x, top: quickPos.y }}>
      {quickNode.kind === "text"
        ? <button onClick={() => beginTextEdit(quickNode.id)} type="button"><PenLine aria-hidden="true" />编辑</button>
        : <><button onClick={() => setPickerNodeId(quickNode.id)} type="button"><FolderOpen aria-hidden="true" />{quickNode.assetId ? "替换素材" : "资产库"}</button>{quickNode.kind !== "audio" && <button onClick={() => setGenNodeId(quickNode.id)} type="button"><Sparkles aria-hidden="true" />生成</button>}</>}
    </div>}
    {selectedEdge && (() => {
      const from = nodeMap.get(selectedEdge.from), to = nodeMap.get(selectedEdge.to);
      const rect = boardRef.current?.getBoundingClientRect();
      if (!from || !to || !rect) return null;
      const mx = rect.left + ((from.x + NODE_WIDTH + to.x) / 2) * zoom + pan.x;
      const my = rect.top + ((from.y + to.y) / 2 + NODE_ANCHOR_Y) * zoom + pan.y;
      return <button aria-label="删除选中连线" className="edge-delete-btn" onClick={() => { setConnections((current) => current.filter((item) => !(item.from === selectedEdge.from && item.to === selectedEdge.to))); setSelectedEdge(null); }} style={{ left: mx, top: my }} type="button"><Trash2 aria-hidden="true" />删除连线</button>;
    })()}
    <div className="canvas-corner">
      <CanvasMinimap boardSize={boardSize} connections={connections} nodes={nodes} onNavigate={navigateTo} pan={pan} zoom={zoom} />
      <div className="canvas-zoom slim"><button onClick={() => setZoom((value) => clampZoom(value - 0.1))} type="button"><Minus /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => clampZoom(value + 0.1))} type="button"><Plus /></button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} type="button">重置</button></div>
    </div>
    {notice && <div className="board-toast" role="status">{notice}</div>}
    {pickerNode && <AssetPickerModal kind={pickerNode.kind === "video" ? "VIDEO" : pickerNode.kind === "audio" ? "AUDIO" : "IMAGE"} onClose={() => setPickerNodeId(null)} onConfirm={(asset, url) => { updateNode(pickerNode.id, { assetId: asset.id, assetName: asset.name, mediaUrl: url, taskId: null, status: null, error: null, progress: 0 }, true); setStaleIds((current) => { const next = new Set(current); next.delete(pickerNode.id); return next; }); setPickerNodeId(null); }} open />}
    {genNode && <NodeGenerationPanel anchor={genAnchor} node={genNode} onClose={() => setGenNodeId(null)} onNotice={showNotice} onSubmitted={(taskId) => { updateNode(genNode.id, { taskId, status: "QUEUED", progress: 0, error: null }); setGenNodeId(null); }} onSubmitError={(message) => { updateNode(genNode.id, { taskId: null, status: "FAILED", error: message }); setGenNodeId(null); }} upstream={genUpstream} />}
  </div>;
}

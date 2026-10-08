/**
 * 画布功能的共享类型与纯函数工具。
 * 服务端契约见 PRD F-028~F-032：/api/v1/canvases CRUD，content 整体持久化。
 */

export type NodeKind = "text" | "image" | "video" | "audio";

export type CanvasNode = {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  title?: string;
  text?: string;
  assetId?: string | null;
  assetName?: string | null;
  mediaUrl?: string | null;
  taskId?: string | null;
  status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | null;
  progress?: number;
  error?: string | null;
  contentRev: number;
  sources?: string[];
};

export type CanvasConnection = { from: string; to: string };

export type CanvasContent = {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  zoom: number;
  pan: { x: number; y: number };
};

export type CanvasSummary = { id: string; name: string; createdAt: string; updatedAt: string; nodeCount: number };
export type CanvasResponse = CanvasSummary & { content: CanvasContent };

export const NODE_KINDS: NodeKind[] = ["text", "image", "video", "audio"];

export const NODE_WIDTH = 190;
export const NODE_ANCHOR_Y = 26;
export const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

/** 轻量 cuid：时间戳 base36 + 随机段，仅前端本地生成用。 */
export function createNodeId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyContent(): CanvasContent {
  return { nodes: [], connections: [], zoom: 1, pan: { x: 0, y: 0 } };
}

/** 沿 from → to 方向传递式收集全部下游节点 id（不含起点自身）。 */
export function collectDownstream(id: string, connections: CanvasConnection[]): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const edge of connections) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  const result = new Set<string>();
  const queue = [...(outgoing.get(id) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (result.has(current)) continue;
    result.add(current);
    queue.push(...(outgoing.get(current) ?? []));
  }
  return result;
}

/** 若新增 from→to 会成环（沿 to 出发能走回 from）则返回 true。 */
export function wouldCreateCycle(from: string, to: string, connections: CanvasConnection[]) {
  if (from === to) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of connections) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  const visited = new Set<string>();
  const queue = [to];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export function hasConnection(connections: CanvasConnection[], from: string, to: string) {
  return connections.some((edge) => edge.from === from && edge.to === to);
}

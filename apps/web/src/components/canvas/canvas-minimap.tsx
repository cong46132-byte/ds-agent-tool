"use client";

import { PointerEvent as ReactPointerEvent, useMemo, useRef } from "react";
import { NODE_WIDTH, type CanvasConnection, type CanvasNode } from "../../lib/canvas-types";
import { measureNode } from "../../lib/canvas-export";

const BOX_W = 150;
const BOX_H = 100;
const PAD = 8;

const KIND_COLOR: Record<CanvasNode["kind"], string> = { text: "#ddce9f", image: "#d0c9b8", video: "#c3bcac", audio: "#d5caae" };

type CanvasMinimapProps = {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  zoom: number;
  pan: { x: number; y: number };
  boardSize: { width: number; height: number };
  onNavigate: (worldX: number, worldY: number) => void;
};

/** 左下角小地图：内容缩略 + 当前视口框，点击/拖动视口框平移画布。 */
export function CanvasMinimap({ nodes, connections, zoom, pan, boardSize, onNavigate }: CanvasMinimapProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    let minX = 0, minY = 0, maxX = 460, maxY = 320;
    for (const node of nodes) {
      const { height } = measureNode(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + NODE_WIDTH);
      maxY = Math.max(maxY, node.y + height);
    }
    const worldW = maxX - minX, worldH = maxY - minY;
    const scale = Math.min((BOX_W - PAD * 2) / worldW, (BOX_H - PAD * 2) / worldH);
    return {
      scale,
      ox: PAD + (BOX_W - PAD * 2 - worldW * scale) / 2 - minX * scale,
      oy: PAD + (BOX_H - PAD * 2 - worldH * scale) / 2 - minY * scale,
    };
  }, [nodes]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const view = {
    x: layout.ox + (-pan.x / zoom) * layout.scale,
    y: layout.oy + (-pan.y / zoom) * layout.scale,
    w: (boardSize.width / zoom) * layout.scale,
    h: (boardSize.height / zoom) * layout.scale,
  };

  function navigate(event: ReactPointerEvent) {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    onNavigate((event.clientX - rect.left - layout.ox) / layout.scale, (event.clientY - rect.top - layout.oy) / layout.scale);
  }

  return <div className="canvas-minimap" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); navigate(event); }} onPointerMove={(event) => { if (event.buttons) navigate(event); }} ref={boxRef} role="presentation" title="小地图 · 点击或拖动移动视口">
    <svg height={BOX_H} width={BOX_W}>
      {connections.map((edge) => {
        const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to);
        if (!from || !to) return null;
        return <line className="mm-edge" key={`${edge.from}-${edge.to}`} x1={layout.ox + (from.x + NODE_WIDTH) * layout.scale} x2={layout.ox + to.x * layout.scale} y1={layout.oy + (from.y + 12) * layout.scale} y2={layout.oy + (to.y + 12) * layout.scale} />;
      })}
      {nodes.map((node) => {
        const { height } = measureNode(node);
        return <rect className="mm-node" fill={KIND_COLOR[node.kind]} height={Math.max(3, height * layout.scale)} key={node.id} rx="1" width={Math.max(4, NODE_WIDTH * layout.scale)} x={layout.ox + node.x * layout.scale} y={layout.oy + node.y * layout.scale} />;
      })}
      <rect className="mm-view" height={view.h} width={view.w} x={view.x} y={view.y} />
    </svg>
  </div>;
}

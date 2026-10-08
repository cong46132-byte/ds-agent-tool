/**
 * 画布导出（PRD F-032）：手写 Canvas2D 渲染器 + 手写极简单页 PDF。
 * 导出范围固定为全部内容（AC-F032-02 不截断），按节点 bounding box + 60px 边距出图。
 */
import { NODE_WIDTH, type CanvasContent, type CanvasNode } from "./canvas-types";

const HEADER_H = 30;
const MARGIN = 60;
const MAX_PNG = 4096;
const MAX_PDF_PT = 14400;

const KIND_LABEL: Record<CanvasNode["kind"], string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };

/** 与界面节点卡片一致的近似高度测算（供导出排版与小地图）。 */
export function measureNode(node: CanvasNode) {
  if (node.kind !== "text") {
    let height = 9;
    height += node.kind === "audio" ? (node.assetId ? 76 : 72) : 225;
    if (!node.assetId) height += 76;
    if (node.assetName) height += 16;
    if (node.sources?.length) height += 14;
    return { width: NODE_WIDTH, height };
  }
  let height = HEADER_H + 8;
  const charsPerLine = 14;
  const lineCount = Math.min(10, Math.max(1, Math.ceil((node.text ?? "").length / charsPerLine)));
  height += lineCount * 16 + 6;
  if (node.sources?.length) height += 14;
  return { width: NODE_WIDTH, height };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (char === "\n" || ctx.measureText(line + char).width > maxWidth) {
      lines.push(line);
      line = char === "\n" ? "" : char;
      if (lines.length >= maxLines) break;
    } else {
      line += char;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && line && lines[maxLines - 1] !== line) lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, -1)}…`;
  return lines.length ? lines : ["（空文本）"];
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** 离屏加载视频并截取首帧用于导出；跨域或无 CORS 时返回 null 走占位降级。 */
function loadVideoFrame(url: string) {
  return new Promise<HTMLVideoElement | null>((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    const timer = window.setTimeout(() => { video.onloadeddata = null; video.onerror = null; video.removeAttribute("src"); video.load(); resolve(null); }, 6000);
    video.onloadeddata = () => { window.clearTimeout(timer); resolve(video); };
    video.onerror = () => { window.clearTimeout(timer); resolve(null); };
    video.src = url;
  });
}

async function renderBoard(content: CanvasContent): Promise<{ canvas: HTMLCanvasElement; skipped: number }> {
  const { nodes, connections } = content;
  let minX = 0, minY = 0, maxX = 800, maxY = 600;
  for (const node of nodes) {
    const { height } = measureNode(node);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + NODE_WIDTH);
    maxY = Math.max(maxY, node.y + height);
  }
  minX -= MARGIN; minY -= MARGIN; maxX += MARGIN; maxY += MARGIN;
  const worldW = maxX - minX, worldH = maxY - minY;
  const scale = Math.min(1, MAX_PNG / Math.max(worldW, worldH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(worldW * scale));
  canvas.height = Math.max(1, Math.round(worldH * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.translate(-minX, -minY);

  ctx.fillStyle = "#f7f3e8";
  ctx.fillRect(minX, minY, worldW, worldH);
  ctx.fillStyle = "#e6dfcc";
  for (let gx = Math.floor(minX / 24) * 24; gx <= maxX; gx += 24) {
    for (let gy = Math.floor(minY / 24) * 24; gy <= maxY; gy += 24) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const images = new Map<string, HTMLImageElement | null>();
  const videoFrames = new Map<string, HTMLVideoElement | null>();
  let skipped = 0;
  await Promise.all(nodes.filter((node) => node.kind === "image" && node.mediaUrl).map(async (node) => {
    const image = await loadImage(node.mediaUrl!);
    images.set(node.id, image);
    if (!image) skipped += 1;
  }));
  await Promise.all(nodes.filter((node) => node.kind === "video" && node.mediaUrl).map(async (node) => {
    const frame = await loadVideoFrame(node.mediaUrl!);
    videoFrames.set(node.id, frame);
    if (!frame) skipped += 1;
  }));

  ctx.strokeStyle = "#b58b30";
  ctx.lineWidth = 2;
  for (const edge of connections) {
    const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to);
    if (!from || !to) continue;
    const x1 = from.x + NODE_WIDTH, y1 = from.y + 26, x2 = to.x, y2 = to.y + 26;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + 75, y1, x2 - 75, y2, x2, y2);
    ctx.stroke();
  }

  for (const node of nodes) {
    const { height } = measureNode(node);
    ctx.save();
    ctx.shadowColor = "rgba(63,52,25,.16)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#fffdf7";
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, NODE_WIDTH, height, 9);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#d8cfae";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(node.x + 0.5, node.y + 0.5, NODE_WIDTH - 1, height - 1, 9);
    ctx.stroke();

    const title = node.title || KIND_LABEL[node.kind];
    let cursorY: number;
    if (node.kind === "text") {
      ctx.fillStyle = "#8a7c55";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(title, node.x + 10, node.y + 19, NODE_WIDTH - 20);
      cursorY = node.y + HEADER_H + 4;
      ctx.fillStyle = "#655e50";
      ctx.font = "12px sans-serif";
      for (const line of wrapText(ctx, node.text ?? "", NODE_WIDTH - 24, 10)) {
        cursorY += 16;
        ctx.fillText(line, node.x + 12, cursorY);
      }
    } else {
      const innerW = NODE_WIDTH - 12;
      const mediaH = node.kind === "audio" ? 68 : 219;
      ctx.fillStyle = "#ece5d2";
      ctx.beginPath();
      ctx.roundRect(node.x + 6, node.y + 5, innerW, mediaH, 7);
      ctx.fill();
      const image = images.get(node.id);
      const frame = videoFrames.get(node.id);
      if ((node.kind === "image" && image) || (node.kind === "video" && frame)) {
        const source = node.kind === "image" ? image! : frame!;
        const sw = node.kind === "image" ? (source as HTMLImageElement).width : (source as HTMLVideoElement).videoWidth;
        const sh = node.kind === "image" ? (source as HTMLImageElement).height : (source as HTMLVideoElement).videoHeight;
        const ratio = Math.max(innerW / sw, mediaH / sh);
        const dw = sw * ratio, dh = sh * ratio;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(node.x + 6, node.y + 5, innerW, mediaH, 7);
        ctx.clip();
        ctx.drawImage(source, node.x + 6 + (innerW - dw) / 2, node.y + 5 + (mediaH - dh) / 2, dw, dh);
        ctx.restore();
      } else if (!node.assetId || node.kind === "audio") {
        ctx.fillStyle = "#9b8f74";
        ctx.font = "10px sans-serif";
        const label = node.assetId ? KIND_LABEL[node.kind] : `${KIND_LABEL[node.kind]} · 未引用素材`;
        ctx.fillText(label, node.x + 14, node.y + 5 + mediaH / 2, innerW - 16);
      } else {
        ctx.fillStyle = "#9b8f74";
        ctx.font = "10px sans-serif";
        ctx.fillText(node.mediaUrl ? `${KIND_LABEL[node.kind]}加载失败` : "正在加载…", node.x + 14, node.y + 5 + mediaH / 2, innerW - 16);
      }
      ctx.font = "10px sans-serif";
      const tw = Math.min(ctx.measureText(title).width, innerW - 34);
      ctx.fillStyle = "rgba(27,26,22,.55)";
      ctx.beginPath();
      ctx.roundRect(node.x + 12, node.y + 11, tw + 14, 17, 5);
      ctx.fill();
      ctx.fillStyle = "#fbf6e8";
      ctx.fillText(title, node.x + 19, node.y + 23.5, innerW - 34);
      cursorY = node.y + 5 + mediaH + 6;
    }
    if (node.assetName) {
      cursorY += 12;
      ctx.fillStyle = "#999181";
      ctx.font = "9px sans-serif";
      ctx.fillText(node.assetName, node.x + 10, cursorY, NODE_WIDTH - 20);
    }
    if (node.sources?.length) {
      cursorY += 13;
      ctx.fillStyle = "#b58b30";
      ctx.font = "9px sans-serif";
      ctx.fillText(`来自 ${node.sources.join("、")}`, node.x + 10, cursorY, NODE_WIDTH - 20);
    }
  }
  return { canvas, skipped };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportCanvasPng(content: CanvasContent, name: string) {
  const { canvas, skipped } = await renderBoard(content);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画布导出失败，请重试");
  downloadBlob(blob, `${name}.png`);
  return { skipped };
}

/** 极简单页 PDF：JPEG 作为内联图像（BI/ID/EI）整页贴图，字节偏移手工计算。 */
function buildPdf(jpegBytes: Uint8Array, imgW: number, imgH: number) {
  const fit = Math.min(1, MAX_PDF_PT / Math.max(imgW, imgH));
  const pageW = Math.round(imgW * fit * 100) / 100;
  const pageH = Math.round(imgH * fit * 100) / 100;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  const beginObject = (number: number, header: string) => {
    offsets[number] = offset;
    push(`${number} 0 obj\n${header}\n`);
  };

  // %PDF 头后必须紧跟二进制注释（4 个 >127 字节），否则部分阅读器按文本处理损坏 JPEG 数据
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const inlineImage = `q\n${pageW} 0 0 ${pageH} 0 0 cm\nBI\n/W ${imgW} /H ${imgH} /CS /RGB /BPC 8 /F /DCT /L ${jpegBytes.length}\nID\n`;
  const contentTail = "\nEI\nQ\n";
  beginObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  push("endobj\n");
  beginObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  push("endobj\n");
  beginObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /ProcSet [/PDF /ImageC] >> /Contents 4 0 R >>`);
  push("endobj\n");
  beginObject(4, `<< /Length ${inlineImage.length + jpegBytes.length + contentTail.length} >>\nstream`);
  push(inlineImage);
  push(jpegBytes);
  push(contentTail);
  push("endstream\nendobj\n");

  const xrefOffset = offset;
  let xref = "xref\n0 5\n0000000000 65535 f \n";
  for (let number = 1; number <= 4; number += 1) xref += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export async function exportCanvasPdf(content: CanvasContent, name: string) {
  const { canvas, skipped } = await renderBoard(content);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const jpegBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  downloadBlob(buildPdf(jpegBytes, canvas.width, canvas.height), `${name}.pdf`);
  return { skipped };
}

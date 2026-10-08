import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@ds/database";
import type { CanvasContent, CanvasResponse, CanvasSummary, CreateCanvas, UpdateCanvas } from "@ds/contracts";

const EMPTY_CONTENT: CanvasContent = { nodes: [], connections: [], zoom: 1, pan: { x: 0, y: 0 } };

function toSummary(canvas: { id: string; name: string; content: unknown; createdAt: Date; updatedAt: Date }): CanvasSummary {
  const nodes = (canvas.content as CanvasContent | null)?.nodes;
  return { id: canvas.id, name: canvas.name, createdAt: canvas.createdAt.toISOString(), updatedAt: canvas.updatedAt.toISOString(), nodeCount: Array.isArray(nodes) ? nodes.length : 0 };
}

function toResponse(canvas: { id: string; name: string; content: unknown; createdAt: Date; updatedAt: Date }): CanvasResponse {
  return { ...toSummary(canvas), content: (canvas.content as CanvasContent) ?? EMPTY_CONTENT };
}

@Injectable()
export class CanvasesService {
  async list(userId: string): Promise<CanvasSummary[]> {
    const canvases = await prisma.canvas.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
    return canvases.map(toSummary);
  }

  async create(userId: string, input: CreateCanvas): Promise<CanvasResponse> {
    const canvas = await prisma.canvas.create({ data: { userId, name: input.name, content: (input.content as object) ?? EMPTY_CONTENT } });
    return toResponse(canvas);
  }

  async get(userId: string, id: string): Promise<CanvasResponse> {
    const canvas = await prisma.canvas.findFirst({ where: { id, userId } });
    if (!canvas) throw new NotFoundException({ code: "CANVAS_NOT_FOUND", message: "画布不存在或无权访问" });
    return toResponse(canvas);
  }

  async update(userId: string, id: string, input: UpdateCanvas): Promise<CanvasResponse> {
    await this.get(userId, id);
    const canvas = await prisma.canvas.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.content !== undefined ? { content: input.content as object } : {}) } });
    return toResponse(canvas);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await prisma.canvas.delete({ where: { id } });
  }
}

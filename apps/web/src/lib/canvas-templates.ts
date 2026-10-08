import type { CanvasContent, CanvasNode } from "./canvas-types";

/** 新建画布可选模板（PRD F-028）。content 直接作为 POST /canvases 的初始内容。 */
export type CanvasTemplate = { id: string; name: string; description: string; content: CanvasContent };

function node(partial: Omit<CanvasNode, "contentRev"> & { contentRev?: number }): CanvasNode {
  return { contentRev: 1, ...partial };
}

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: "blank",
    name: "空白画布",
    description: "从零开始自由搭建内容流程",
    content: { nodes: [], connections: [], zoom: 1, pan: { x: 0, y: 0 } },
  },
  {
    id: "script-flow",
    name: "带货脚本流程",
    description: "脚本 + 产品图 → 带货成片",
    content: {
      nodes: [
        node({ id: "tpl-script", kind: "text", x: 120, y: 80, title: "带货脚本", text: "开场 3 秒钩子：把价格打下来！\n中段：展示上身效果与核心卖点\n结尾 CTA：点击下方链接立即下单" }),
        node({ id: "tpl-product", kind: "image", x: 120, y: 300, title: "产品图", text: "从资产库选择商品主图，或点击生成" }),
        node({ id: "tpl-video", kind: "video", x: 430, y: 170, title: "带货成片", text: "引用脚本与产品图，生成 15s 带货视频" }),
      ],
      connections: [
        { from: "tpl-script", to: "tpl-product" },
        { from: "tpl-script", to: "tpl-video" },
        { from: "tpl-product", to: "tpl-video" },
      ],
      zoom: 1,
      pan: { x: 40, y: 30 },
    },
  },
  {
    id: "outfit-seeding",
    name: "穿搭种草流程",
    description: "服装图 → 上身效果 → 种草视频",
    content: {
      nodes: [
        node({ id: "tpl-cloth", kind: "image", x: 120, y: 120, title: "服装图", text: "从资产库选择服装平铺图" }),
        node({ id: "tpl-tryon", kind: "image", x: 360, y: 120, title: "上身效果图", text: "引用服装图生成模特上身效果" }),
        node({ id: "tpl-copy", kind: "text", x: 120, y: 360, title: "种草文案", text: "约会通勤两不误的温柔针织开衫，软糯亲肤不扎人，小个子也能穿出比例感。" }),
        node({ id: "tpl-seed-video", kind: "video", x: 600, y: 160, title: "种草视频", text: "引用上身效果图与种草文案，生成种草短片" }),
      ],
      connections: [
        { from: "tpl-cloth", to: "tpl-tryon" },
        { from: "tpl-tryon", to: "tpl-seed-video" },
        { from: "tpl-copy", to: "tpl-seed-video" },
      ],
      zoom: 1,
      pan: { x: 20, y: 20 },
    },
  },
];

export function getTemplate(id: string) {
  return CANVAS_TEMPLATES.find((template) => template.id === id) ?? CANVAS_TEMPLATES[0]!;
}

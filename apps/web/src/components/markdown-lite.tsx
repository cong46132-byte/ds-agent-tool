"use client";

import { ReactNode } from "react";

/**
 * 零依赖 Markdown 轻渲染器（超级编导脚本文档）。
 * 支持子集：##/###/#### 标题、**加粗**、- 无序列表、1. 有序列表、--- 分隔线、段落与换行。
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(<strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
    index += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function MarkdownLite({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  function flushList() {
    if (!list) return;
    const items = list.items.map((item, itemIndex) => <li key={`l${key}-${itemIndex}`}>{renderInline(item, `l${key}-${itemIndex}`)}</li>);
    blocks.push(list.ordered ? <ol key={`list${key}`}>{items}</ol> : <ul key={`list${key}`}>{items}</ul>);
    list = null;
    key += 1;
  }

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1]!.length;
      const content = renderInline(heading[2]!, `h${key}`);
      blocks.push(level === 2 ? <h3 key={`h${key}`}>{content}</h3> : level === 3 ? <h4 key={`h${key}`}>{content}</h4> : <h5 key={`h${key}`}>{content}</h5>);
      key += 1;
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      flushList();
      blocks.push(<hr key={`hr${key}`} />);
      key += 1;
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(unordered[1]!);
      continue;
    }
    const ordered = line.match(/^\d+[.、)]\s*(.+)$/);
    if (ordered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]!);
      continue;
    }
    flushList();
    blocks.push(<p key={`p${key}`}>{renderInline(line, `p${key}`)}</p>);
    key += 1;
  }
  flushList();
  return <div className="markdown-lite">{blocks}</div>;
}

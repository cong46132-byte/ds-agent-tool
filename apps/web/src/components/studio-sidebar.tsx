"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bot, Coins, FolderOpen, Home, Image as ImageIcon, LayoutDashboard, UserRound, Video, type LucideIcon } from "lucide-react";
import { apiRequest, hasSession } from "../lib/api";

const navItems: ReadonlyArray<{ icon: LucideIcon; label: string; href?: string }> = [
  { icon: Home, label: "首页", href: "/" },
  { icon: Bot, label: "Agent", href: "/agent" },
  { icon: Video, label: "AI视频", href: "/create/ecommerce-video" },
  { icon: ImageIcon, label: "AI图片", href: "/image" },
  { icon: LayoutDashboard, label: "画布", href: "/canvas" },
  { icon: FolderOpen, label: "资产", href: "/assets" },
];

function BrandLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40">
      <path d="M20 3 24.5 15.5 37 20l-12.5 4.5L20 37l-4.5-12.5L3 20l12.5-4.5L20 3Z" />
      <circle cx="20" cy="20" r="3.2" />
    </svg>
  );
}

export function StudioSidebar() {
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!hasSession()) return;
    setSignedIn(true);
    apiRequest<{ credits: { available: number } }>("/auth/me")
      .then((user) => setCredits(user.credits.available))
      .catch(() => { setCredits(null); setSignedIn(false); });
  }, []);

  return (
    <aside className="sidebar">
      <Link className="brand-mark" href="/" aria-label="星构 AI 首页"><BrandLogo /></Link>
      <nav aria-label="主要导航">
        {navItems.map(({ icon: Icon, label, href }) => {
          const imageCreation = ["product-detail-set", "virtual-try-on", "product-white-background", "image-retouche", "face-three-view", "person-four-view", "model-face-swap", "face-fusion", "product-use", "clothing-redesign", "person-in-scene", "person-realism"];
          const active = href === "/" ? pathname === "/" : label === "AI图片" ? pathname === "/image" || imageCreation.some((item) => pathname === `/create/${item}`) : href ? pathname.startsWith(href) : false;
          const content = <><Icon aria-hidden="true" /><small>{label}</small>{!href && <em>开发中</em>}</>;
          return href ? (
            <Link className={active ? "nav-item active" : "nav-item"} href={href} key={label}>{content}</Link>
          ) : (
            <button className="nav-item disabled" disabled key={label} title={`${label}开发中`} type="button">{content}</button>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="credits" title={credits === null ? "登录后查看积分" : `可用积分 ${credits}`}><Coins aria-hidden="true" /><strong>{credits ?? "—"}</strong><span>积分</span></div>
        <Link className="avatar" href={signedIn ? "/account" : "/auth"} aria-label="账户"><UserRound aria-hidden="true" /></Link>
      </div>
    </aside>
  );
}

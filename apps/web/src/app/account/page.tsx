"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins, History, LoaderCircle, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, hasSession, logoutSession, type CurrentUser } from "../../lib/api";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!hasSession()) { router.replace("/auth?next=/account"); return; }
    apiRequest<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => router.replace("/auth?next=/account"))
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    setLoggingOut(true);
    await logoutSession();
    router.replace("/auth");
  }

  return <div className="studio-shell">
    <StudioSidebar />
    <main className="workspace account-workspace">
      <header className="assets-header"><div><p className="product-kicker">ACCOUNT · 账户中心</p><h1>个人账户</h1><p>查看账户身份、积分和会话状态</p></div></header>
      {loading ? <section className="asset-loading"><LoaderCircle className="spin" aria-hidden="true" />正在验证登录状态</section> : user && <>
        <section className="account-profile">
          <span className="account-avatar"><UserRound aria-hidden="true" /></span>
          <div><h2>{user.displayName || "未设置昵称"}</h2><p><Mail aria-hidden="true" />{user.email}</p></div>
          <span className="account-status"><ShieldCheck aria-hidden="true" />账号正常</span>
        </section>
        <section className="account-grid">
          <Link href="/billing"><Coins aria-hidden="true" /><span>可用积分</span><strong>{user.credits.available}</strong><small>查看订阅与积分明细</small></Link>
          <Link href="/tasks"><History aria-hidden="true" /><span>生成任务</span><strong>历史记录</strong><small>查看排队、生成中和已完成任务</small></Link>
          <article><ShieldCheck aria-hidden="true" /><span>登录方式</span><strong>账号密码</strong><small>邮箱账号已验证登录</small></article>
        </section>
        <section className="account-security"><div><h2>当前会话</h2><p>退出后服务端会立即撤销刷新令牌，本设备需要重新登录。</p></div><button disabled={loggingOut} onClick={logout} type="button">{loggingOut ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}{loggingOut ? "正在退出" : "退出登录"}</button></section>
      </>}
    </main>
  </div>;
}

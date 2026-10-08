"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
import { ApiError, authenticate } from "../../lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const data = new FormData(event.currentTarget); const password = String(data.get("password"));
    if (password !== String(data.get("confirmPassword"))) { setError("两次输入的密码不一致"); setLoading(false); return; }
    try {
      await authenticate("register", { displayName: String(data.get("displayName")), email: String(data.get("email")), password });
      router.replace("/assets");
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "暂时无法连接服务，请稍后重试"); }
    finally { setLoading(false); }
  }
  return <main className="auth-page">
    <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" />返回工作台</Link>
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-seal">造</span><div><strong>造物引擎</strong><small>AI E-COMMERCE STUDIO</small></div></div>
      <p className="product-kicker">ACCOUNT · 创作者账户</p><h1>创建账户</h1>
      <p className="auth-intro">注册后自动登录。生成能力需按订阅档位获得积分。</p>
      <div className="auth-tabs"><Link href="/auth">账号登录</Link><Link className="selected" href="/register">注册</Link></div>
      <form className="auth-form" onSubmit={submit}>
        <label><span>昵称</span><div><UserRound aria-hidden="true" /><input autoComplete="name" maxLength={50} name="displayName" placeholder="怎么称呼你" required /></div></label>
        <label><span>邮箱账号</span><div><Mail aria-hidden="true" /><input autoComplete="email" maxLength={254} name="email" placeholder="name@example.com" required type="email" /></div></label>
        <label><span>设置密码</span><div><LockKeyhole aria-hidden="true" /><input autoComplete="new-password" minLength={8} maxLength={72} name="password" placeholder="至少 8 位字符" required type="password" /></div></label>
        <label><span>确认密码</span><div><LockKeyhole aria-hidden="true" /><input autoComplete="new-password" minLength={8} maxLength={72} name="confirmPassword" placeholder="再次输入密码" required type="password" /></div></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={loading} type="submit">{loading && <LoaderCircle className="spin" aria-hidden="true" />}{loading ? "正在创建账户" : "注册并登录"}</button>
      </form>
    </section>
  </main>;
}

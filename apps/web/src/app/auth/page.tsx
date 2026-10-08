"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { ApiError, authenticate } from "../../lib/api";

export default function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await authenticate("login", { email: String(data.get("email")), password: String(data.get("password")) });
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/assets");
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "暂时无法连接服务，请稍后重试"); }
    finally { setLoading(false); }
  }
  return <main className="auth-page">
    <Link className="auth-back" href="/"><ArrowLeft aria-hidden="true" />返回工作台</Link>
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-seal">造</span><div><strong>造物引擎</strong><small>AI E-COMMERCE STUDIO</small></div></div>
      <p className="product-kicker">ACCOUNT · 创作者账户</p><h1>账号密码登录</h1>
      <p className="auth-intro">登录后上传的素材、生成任务和作品会安全保存到你的资产库。</p>
      <div className="auth-tabs"><Link className="selected" href="/auth">账号登录</Link><Link href="/register">注册</Link></div>
      <form className="auth-form" onSubmit={submit}>
        <label><span>邮箱账号</span><div><Mail aria-hidden="true" /><input autoComplete="email" name="email" placeholder="name@example.com" required type="email" /></div></label>
        <label><span>密码</span><div><LockKeyhole aria-hidden="true" /><input autoComplete="current-password" maxLength={72} name="password" placeholder="请输入密码" required type="password" /></div></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={loading} type="submit">{loading && <LoaderCircle className="spin" aria-hidden="true" />}{loading ? "请稍候" : "登录并继续"}</button>
      </form>
    </section>
  </main>;
}

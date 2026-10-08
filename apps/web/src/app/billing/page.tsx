"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Coins, Crown, LoaderCircle } from "lucide-react";
import { StudioSidebar } from "../../components/studio-sidebar";
import { apiRequest, hasSession } from "../../lib/api";

type Overview = { credits: { balance: number; held: number; available: number }; subscription: { tier: string; status: string; expiresAt: string | null } };
type Transaction = { id: string; type: string; amount: number; balanceAfter: number; metadata: { capability?: string; reason?: string; tier?: string; period?: string } | null; createdAt: string };
const plans = [{ tier: "BASIC", name: "基础版", credits: 500, features: ["基础图片与视频模型", "500 订阅积分", "40 条历史记录"] }, { tier: "PRO", name: "专业版", credits: 2000, features: ["高品质国产模型", "2000 订阅积分", "可关闭平台水印"] }, { tier: "VIP", name: "旗舰版", credits: 6000, features: ["全部 VIP 模型", "更高时长与分辨率", "6000 订阅积分"] }];

const capabilityLabels: Record<string, string> = { product_detail_set: "商详套图", video_recreation: "深度复刻", director_video: "超级编导", virtual_try_on: "服装上身", product_use: "商品使用", clothing_redesign: "服装改款", face_three_view: "脸部三视图", person_four_view: "人物四视图", model_face_swap: "模特换脸", face_fusion: "人脸融合", person_in_scene: "人物入景", person_realism: "人物真人感", product_white_background: "商品白底图", image_retouche: "图片精修" };

function transactionDisplay(item: Transaction) {
  const capability = item.metadata?.capability ? capabilityLabels[item.metadata.capability] ?? item.metadata.capability : "AI 生成";
  if (item.type === "GENERATION_HOLD") return { title: `${capability}·预冻结`, detail: "任务提交后暂时占用，此时未从总余额扣除", amount: `冻结 ${Math.abs(item.amount)}`, tone: "held" };
  if (item.type === "GENERATION_COMMIT") return { title: `${capability}·生成成功`, detail: "任务完成，预冻结积分转为实际消耗", amount: `-${Math.abs(item.amount)}`, tone: "negative" };
  if (item.type === "GENERATION_REFUND") return { title: `${capability}·已退回`, detail: item.metadata?.reason === "USER_CANCELED" ? "任务已取消，冻结积分已释放" : "任务未成功，冻结积分已释放", amount: `释放 ${Math.abs(item.amount)}`, tone: "positive" };
  if (item.type === "SUBSCRIPTION_GRANT") return { title: "订阅积分发放", detail: `${item.metadata?.tier ?? "付费"}档位 · ${item.metadata?.period ?? "当前周期"}`, amount: `+${Math.abs(item.amount)}`, tone: "positive" };
  if (item.type === "ADMIN_ADJUSTMENT") return { title: item.amount >= 0 ? "平台积分发放" : "平台积分调整", detail: item.metadata?.reason ?? "由平台管理员调整", amount: `${item.amount > 0 ? "+" : ""}${item.amount}`, tone: item.amount >= 0 ? "positive" : "negative" };
  return { title: "积分变动", detail: item.type, amount: `${item.amount > 0 ? "+" : ""}${item.amount}`, tone: item.amount >= 0 ? "positive" : "negative" };
}

export default function BillingPage() {
  const router = useRouter(); const [overview, setOverview] = useState<Overview | null>(null); const [transactions, setTransactions] = useState<Transaction[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!hasSession()) return void router.replace("/auth?next=/billing"); Promise.all([apiRequest<Overview>("/billing/overview"), apiRequest<{ items: Transaction[] }>("/billing/transactions")]).then(([summary, ledger]) => { setOverview(summary); setTransactions(ledger.items); }).catch(() => router.replace("/auth?next=/billing")).finally(() => setLoading(false)); }, [router]);
  return <div className="studio-shell"><StudioSidebar /><main className="workspace platform-page"><header className="assets-header"><div><p className="product-kicker">SUBSCRIPTION · 订阅与积分</p><h1>订阅中心</h1><p>平台仅采用订阅档位制，不提供每日免费积分或积分充值包</p></div></header>{loading ? <section className="asset-loading"><LoaderCircle className="spin" />加载订阅信息</section> : overview && <><section className="billing-summary"><article><Coins /><span>可用积分</span><strong>{overview.credits.available}</strong><small>总额 {overview.credits.balance} · 任务冻结 {overview.credits.held}</small></article><article><Crown /><span>当前档位</span><strong>{overview.subscription.tier}</strong><small>{overview.subscription.status === "ACTIVE" ? "权益状态正常" : overview.subscription.status}</small></article></section><section className="plan-grid billing-plans">{plans.map((plan) => <article className={overview.subscription.tier === plan.tier ? "current" : ""} key={plan.tier}><span>{plan.tier}</span><h2>{plan.name}</h2><strong>{plan.credits} 积分 / 周期</strong>{plan.features.map((feature) => <p key={feature}><Check />{feature}</p>)}<button disabled type="button">支付渠道待配置</button></article>)}</section><section className="ledger"><div className="suite-section-title"><span>CREDITS · 积分流水</span><h2>积分明细</h2></div><p className="ledger-explain">预冻结只是暂时占用可用积分，不算重复扣费；任务成功后才会转为实际消耗。</p>{transactions.length === 0 ? <p>暂无积分流水。订阅开通或生成任务扣费后会记录在这里。</p> : transactions.map((item) => { const display = transactionDisplay(item); return <article className={`ledger-${display.tone}`} key={item.id}><div><span>{display.title}</span><em>{display.detail}</em></div><strong>{display.amount}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")} · 账户余额 {item.balanceAfter}</small></article>; })}</section></>}</main></div>;
}

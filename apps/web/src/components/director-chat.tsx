"use client";

import { ChangeEvent, RefObject } from "react";
import { ArrowDown, FileAudio, Image as ImageIcon, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { MarkdownLite } from "./markdown-lite";

type AssetRef = { id: string; name: string; kind: string } | null;
type Props = {
  phase: "input" | "script" | "final"; category: string; template: string; requirement: string; script: string; finalPrompt: string;
  adjustment: string; notice: string; busy: boolean; scriptBusy: boolean; imageAsset: AssetRef; audioAsset: AssetRef;
  imageRef: RefObject<HTMLInputElement | null>; audioRef: RefObject<HTMLInputElement | null>; model: string; ratio: string; resolution: string;
  duration: string; estimatedCredits: number; onRequirementChange(value: string): void; onAdjustmentChange(value: string): void;
  onFinalPromptChange(value: string): void; onCategoryChange(category: string, template: string): void; onTemplateChange(value: string): void;
  onModelChange(value: string): void; onRatioChange(value: string): void; onResolutionChange(value: string): void; onDurationChange(value: string): void;
  onUploadImage(event: ChangeEvent<HTMLInputElement>): void; onUploadAudio(event: ChangeEvent<HTMLInputElement>): void; onSendScript(): void;
  onSendAdjustment(): void; onApplyScript(): void; onBackToScript(): void; onExitToInput(): void; onReset(): void; onSendVideo(): void;
};

const categoryDefaults: Record<string, string> = { 电商带货: "口播带货", 同城到店: "门店发现", 剧情短片: "对话短剧", 品牌广告: "品牌主张" };
const templateOptions: Record<string, string[]> = {
  电商带货: ["口播带货", "促销转化", "场景种草", "痛点解决", "功能演示"],
  同城到店: ["门店发现", "到店实录", "招牌体验", "同城团购"],
  剧情短片: ["对话短剧", "反转短剧", "悬念短剧", "情绪短片", "产品植入"],
  品牌广告: ["品牌主张", "品牌故事", "生活方式", "创意概念"],
};

export function DirectorChat(props: Props) {
  const templates = templateOptions[props.category] ?? templateOptions.电商带货!;
  return <div className="director-chat-shell"><section className="director-chat-card">
    <header><div className="director-chat-avatar"><Sparkles /></div><div><strong>{props.template}</strong><small>{props.category} · AI 策划与脚本</small></div><button onClick={props.onReset} type="button">＋ 新建</button></header>

    {props.phase === "input" && <div className="director-input-state">
      <div className="director-category-row">{Object.keys(categoryDefaults).map((item) => <button className={props.category === item ? "selected" : ""} key={item} onClick={() => props.onCategoryChange(item, categoryDefaults[item]!)} type="button">{item}</button>)}</div>
      <div className="director-template-row">{templates.map((item) => <button className={props.template === item ? "selected" : ""} key={item} onClick={() => props.onTemplateChange(item)} type="button">{item}</button>)}</div>
      <div className="director-chat-assets"><button onClick={() => props.imageRef.current?.click()} type="button"><ImageIcon /><span>{props.imageAsset?.name ?? "添加图片"}<small>建议上传商品图</small></span></button><button onClick={() => props.audioRef.current?.click()} type="button"><FileAudio /><span>{props.audioAsset?.name ?? "添加声音"}<small>可选</small></span></button></div>
      <input accept="image/jpeg,image/png,image/webp" hidden onChange={props.onUploadImage} ref={props.imageRef} type="file" /><input accept="audio/mpeg,audio/wav,audio/mp4" hidden onChange={props.onUploadAudio} ref={props.audioRef} type="file" />
      <textarea maxLength={10000} onChange={(event) => props.onRequirementChange(event.target.value)} placeholder="描述产品、卖点、目标人群和期望的视频风格，也可以只上传图片让编导主动分析…" value={props.requirement} />
      <div className="director-compose-footer"><span>{props.requirement.length} / 10000</span><button disabled={props.scriptBusy || (!props.requirement.trim() && !props.imageAsset)} onClick={props.onSendScript} type="button">{props.scriptBusy ? <LoaderCircle className="spin" /> : <Sparkles />}分析素材，并生成脚本</button></div>
    </div>}

    {props.phase === "script" && <div className="director-script-state">
      <div className="director-user-bubble">分析素材，并生成脚本</div>
      <article>{props.scriptBusy ? <div className="director-loading"><LoaderCircle className="spin" />正在重新分析素材并调整脚本…</div> : <MarkdownLite source={props.script} />}</article>
      <button className="director-down" onClick={() => document.querySelector(".director-script-state article")?.scrollTo({ top: 999999, behavior: "smooth" })} type="button"><ArrowDown /></button>
      <div className="director-adjust"><textarea maxLength={2000} onChange={(event) => props.onAdjustmentChange(event.target.value)} placeholder="补充修改要求，例如：节奏更快、突出核心卖点…" value={props.adjustment} /><button disabled={props.scriptBusy || !props.adjustment.trim()} onClick={props.onSendAdjustment} type="button"><Send /></button></div>
      <footer><button onClick={props.onExitToInput} type="button"><X />退出编导</button><button className="primary" disabled={props.scriptBusy} onClick={props.onApplyScript} type="button">使用这版脚本</button></footer>
    </div>}

    {props.phase === "final" && <div className="director-final-state">
      <div className="director-final-tools"><button onClick={props.onBackToScript} type="button">返回脚本</button><span>脚本可继续编辑，确认后提交生成</span></div>
      <textarea maxLength={10000} onChange={(event) => props.onFinalPromptChange(event.target.value)} value={props.finalPrompt} />
      <div className="director-config"><label>模型<select onChange={(event) => props.onModelChange(event.target.value)} value={props.model}><option value="doubao-seedance-1-0-pro-fast-251015">Seedance 1.0 Pro Fast</option><option value="doubao-seedance-2-5-260628">Seedance 2.5（需预留金）</option></select></label><label>比例<select onChange={(event) => props.onRatioChange(event.target.value)} value={props.ratio}><option>9:16</option><option>16:9</option><option>1:1</option></select></label><label>分辨率<select onChange={(event) => props.onResolutionChange(event.target.value)} value={props.resolution}><option>480p</option><option>720p</option><option>1080p</option></select></label><label>时长<select onChange={(event) => props.onDurationChange(event.target.value)} value={props.duration}><option>4s</option><option>5s</option><option>10s</option>{props.model !== "doubao-seedance-1-0-pro-fast-251015" && <><option>15s</option><option>30s</option></>}</select></label></div>
      <button className="director-generate" disabled={props.busy || !props.finalPrompt.trim()} onClick={props.onSendVideo} type="button">{props.busy ? "正在提交…" : "开始生成视频"}<span>预计 {props.estimatedCredits} 积分</span></button>
    </div>}
    {props.notice && <p className="director-notice">{props.notice}</p>}
  </section></div>;
}

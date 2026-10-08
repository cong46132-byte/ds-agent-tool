"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { apiRequest, ApiError, getCanvas, hasSession, type CanvasResponse } from "../../../lib/api";
import { CanvasBoard } from "../../../components/canvas/canvas-board";

export default function CanvasEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const canvasId = params.id;
  const [ready, setReady] = useState(false);
  const [canvas, setCanvas] = useState<CanvasResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSession()) return void router.replace(`/auth?next=${encodeURIComponent(`/canvas/${canvasId}`)}`);
    let cancelled = false;
    apiRequest("/auth/me")
      .then(() => getCanvas(canvasId))
      .then((data) => { if (!cancelled) { setCanvas(data); setReady(true); } })
      .catch((reason) => {
        if (cancelled) return;
        if (reason instanceof ApiError && reason.status === 404) { setError("画布不存在或无权访问"); setReady(true); return; }
        router.replace("/auth?next=/canvas");
      });
    return () => { cancelled = true; };
  }, [canvasId, router]);

  if (!ready) return <main className="route-message"><p><LoaderCircle className="spin" /> 正在加载画布…</p></main>;
  if (!canvas) return <main className="route-message"><h1>{error}</h1><button onClick={() => router.replace("/canvas")} type="button">返回画布列表</button></main>;
  return <CanvasBoard key={canvas.id} canvas={canvas} />;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export type AuthUser = { id: string; email: string; displayName: string | null };
export type CurrentUser = AuthUser & { credits: { balance: number; held: number; available: number } };
export type AuthResponse = {
  user: AuthUser;
  tokens: { accessToken: string; refreshToken: string; accessTokenExpiresIn: number; refreshTokenExpiresIn: number };
};
export type Asset = {
  id: string;
  name: string;
  kind: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  source: string;
  createdAt: string;
};

const ACCESS_TOKEN_KEY = "ds_access_token";
const REFRESH_TOKEN_KEY = "ds_refresh_token";

// ---- 画布（/canvases）薄封装，类型见 ./canvas-types ----
import type { CanvasContent, CanvasResponse, CanvasSummary } from "./canvas-types";

export type { CanvasConnection, CanvasContent, CanvasNode, CanvasResponse, CanvasSummary } from "./canvas-types";

export function listCanvases() {
  return apiRequest<CanvasSummary[]>("/canvases");
}
export function createCanvas(input: { name: string; content?: CanvasContent }) {
  return apiRequest<CanvasResponse>("/canvases", { method: "POST", body: JSON.stringify(input) });
}
export function getCanvas(id: string) {
  return apiRequest<CanvasResponse>(`/canvases/${id}`);
}
export function updateCanvas(id: string, input: { name?: string; content?: CanvasContent }) {
  return apiRequest<CanvasResponse>(`/canvases/${id}`, { method: "PUT", body: JSON.stringify(input) });
}
export function deleteCanvas(id: string) {
  return apiRequest<void>(`/canvases/${id}`, { method: "DELETE" });
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export function hasSession() {
  return typeof window !== "undefined" && Boolean(localStorage.getItem(REFRESH_TOKEN_KEY));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function saveSession(response: AuthResponse) {
  localStorage.setItem(ACCESS_TOKEN_KEY, response.tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, response.tokens.refreshToken);
}

async function parseError(response: Response) {
  const body = await response.json().catch(() => null) as { code?: string; message?: string } | null;
  return new ApiError(response.status, body?.code ?? "REQUEST_FAILED", body?.message ?? `请求失败（${response.status}）`);
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearSession();
    return false;
  }
  saveSession(await response.json() as AuthResponse);
  return true;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && await refreshAccessToken()) return apiRequest<T>(path, init, false);
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiStreamRequest<T>(
  path: string,
  input: unknown,
  onDelta: (text: string) => void,
  retry = true,
): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
  });
  if (response.status === 401 && retry && await refreshAccessToken()) return apiStreamRequest<T>(path, input, onDelta, false);
  if (!response.ok) throw await parseError(response);
  if (!response.body) throw new ApiError(502, "STREAM_UNAVAILABLE", "Agent 流式响应不可用");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type: "delta"; text: string } | { type: "result"; data: T };
      if (event.type === "delta") onDelta(event.text);
      else result = event.data;
    }
    if (done) break;
  }
  if (!result) throw new ApiError(502, "STREAM_INCOMPLETE", "Agent 流式响应未完成");
  return result;
}

export async function authenticate(mode: "login" | "register", input: { email: string; password: string; displayName?: string }) {
  const response = await fetch(`${API_BASE_URL}/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await parseError(response);
  const result = await response.json() as AuthResponse;
  saveSession(result);
  return result;
}

export async function logoutSession() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  try {
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } finally {
    clearSession();
  }
}

export async function uploadAsset(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const ticket = await apiRequest<{ fileId: string; uploadUrl: string; method: "PUT"; headers: Record<string, string> }>("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256 }),
  });
  const response = await fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: file });
  if (!response.ok) throw new Error(`素材上传失败（${response.status}）`);
  return apiRequest<Asset>("/uploads/complete", { method: "POST", body: JSON.stringify({ fileId: ticket.fileId }) });
}

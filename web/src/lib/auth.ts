import { api } from "./api";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "member" | "viewer";
  avatar_url?: string;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/login", { email, password });
  api.setToken(res.access_token);
  api.setRefreshToken(res.refresh_token);
  return res;
}

export async function register(data: {
  username: string;
  email: string;
  password: string;
  display_name: string;
}): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>("/auth/register", {
    email: data.email,
    password: data.password,
    name: data.display_name,
  });
  api.setToken(res.access_token);
  api.setRefreshToken(res.refresh_token);
  return res;
}

export async function getMe(): Promise<User> {
  return api.get<User>("/auth/me");
}

export function logout() {
  api.clearToken();
  if (typeof window !== "undefined") window.location.href = "/login";
}

const API_URL = process.env.API_URL || 'http://localhost:31001';

export interface UserCredentials {
  email: string;
  password: string;
  name: string;
}

export const DEFAULT_ADMIN: UserCredentials = {
  email: 'test@openmodel.studio',
  password: 'Test1234',
  name: 'Test User',
};

export const DEFAULT_ANALYST: UserCredentials = {
  email: 'test@openmodel.studio',
  password: 'Test1234',
  name: 'Test User',
};

export async function apiLogin(user: UserCredentials): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export async function apiRegister(user: UserCredentials): Promise<string> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password, name: user.name }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export async function apiGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost(token: string, path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiDelete(token: string, path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

export { API_URL };

import axios from 'axios';

/**
 * 全局 HTTP 客户端。
 *
 * withCredentials: true —— 让浏览器自动携带 httpOnly Cookie 中的 token。
 * 这里刻意没有 Authorization 头的 token 注入逻辑：前端根本拿不到 token，
 * 也就无从注入。凭据的存取完全由浏览器和后端在 Cookie 层面完成。
 */
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 20_000,
});

http.interceptors.response.use(
  (res) => res.data?.data ?? res.data,
  (err) => Promise.reject(err),
);

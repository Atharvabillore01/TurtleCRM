import axios, {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

const BASE_URL      = import.meta.env["VITE_AUTH_SERVICE_URL"]  ?? "http://localhost:4000";
const USER_BASE_URL = import.meta.env["VITE_USER_SERVICE_URL"] ?? "http://localhost:4002";

let _accessToken: string | null = null;
let _isRefreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

export function setAxiosToken(token: string | null): void {
  _accessToken = token;
}

function processQueue(token: string | null): void {
  _refreshQueue.forEach((cb) => cb(token));
  _refreshQueue = [];
}

export const authAxios: AxiosInstance = axios.create({
  baseURL:         BASE_URL,
  withCredentials: true,
  headers:         { "Content-Type": "application/json" },
});

authAxios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) config.headers.set("Authorization", `Bearer ${_accessToken}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── User-service axios (plain Bearer, no refresh retry needed) ───────────────

export const userAxios: AxiosInstance = axios.create({
  baseURL: USER_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

userAxios.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (_accessToken) config.headers.set("Authorization", `Bearer ${_accessToken}`);
    return config;
  },
  (error) => Promise.reject(error)
);

authAxios.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url?.includes("/auth/refresh") ||
      original.url?.includes("/auth/logout")
    ) {
      return Promise.reject(error);
    }

    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push((newToken) => {
          if (newToken) {
            original.headers.set("Authorization", `Bearer ${newToken}`);
            resolve(authAxios(original));
          } else {
            reject(error);
          }
        });
      });
    }

    original._retry = true;
    _isRefreshing   = true;

    try {
      const res = await axios.post<{ accessToken: string }>(
        `${BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken = res.data.accessToken;
      setAxiosToken(newToken);
      processQueue(newToken);
      original.headers.set("Authorization", `Bearer ${newToken}`);
      return authAxios(original);
    } catch (err) {
      setAxiosToken(null);
      processQueue(null);
      return Promise.reject(err);
    } finally {
      _isRefreshing = false;
    }
  }
);

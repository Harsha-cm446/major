import axios from 'axios';

// In production, VITE_API_URL should be set to the Render backend URL (e.g. https://your-backend.onrender.com/api)
// In development, Vite proxy handles /api → localhost:8000
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

// ── Mock Interview ───────────────────────────────────
export const mockAPI = {
  start: (data) => api.post('/mock-interview/start', data),
  submitAnswer: (sessionId, data) => api.post(`/mock-interview/${sessionId}/answer`, data),
  getReport: (sessionId) => api.get(`/mock-interview/${sessionId}/report`),
  getReportPDF: (sessionId) =>
    api.get(`/mock-interview/${sessionId}/report/pdf`, { responseType: 'blob' }),
  history: () => api.get('/mock-interview/history/me'),
  checkTime: (sessionId) => api.get(`/mock-interview/${sessionId}/time`),
  endInterview: (sessionId) => api.post(`/mock-interview/${sessionId}/end`),
};

// ── HR Interview Sessions ────────────────────────────
export const interviewAPI = {
  createSession: (data) => api.post('/interviews/sessions', data),
  listSessions: () => api.get('/interviews/sessions'),
  getSession: (id) => api.get(`/interviews/sessions/${id}`),
  deleteSession: (id) => api.delete(`/interviews/sessions/${id}`),
  inviteCandidates: (sessionId, emails) =>
    api.post(`/interviews/sessions/${sessionId}/invite`, { emails }),
  listCandidates: (sessionId) =>
    api.get(`/interviews/sessions/${sessionId}/candidates`),
};

// ── Candidate AI Interview (token-based, no auth) ────
export const candidateAPI = {
  getInfo: (token) => api.get(`/candidate-interview/${token}/info`),
  start: (token, data) => api.post(`/candidate-interview/${token}/start`, data),
  submitAnswer: (token, data) => api.post(`/candidate-interview/${token}/answer`, data),
  getReport: (token) => api.get(`/candidate-interview/${token}/report`),
  getSessionProgress: (sessionId) => api.get(`/candidate-interview/session/${sessionId}/progress`),
  getPublicUrl: () => api.get('/candidate-interview/public-url'),
  checkTime: (token) => api.get(`/candidate-interview/${token}/time`),
  endInterview: (token) => api.post(`/candidate-interview/${token}/end`),
};

export default api;

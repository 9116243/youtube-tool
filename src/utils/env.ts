export const env = {
  API_BASE: import.meta.env.VITE_API_BASE ?? "http://localhost:3001",
  NODE_ENV: import.meta.env.MODE ?? "development"
};


export default {
  VITE_SERVER_HOST: import.meta.env.VITE_SERVER_HOST || "",
  NODE_ENV: import.meta.env.DEV ? "development" : "production",
};

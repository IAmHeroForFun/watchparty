import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch (e) {
  // Ignore missing .env in production
}

const defaults = {
  PORT: 38282,
  HOST: "0.0.0.0",
  NODE_ENV: "",
  BUILD_DIRECTORY: "build",
  SSL_KEY_FILE: "",
  SSL_CRT_FILE: "",
};

export default {
  ...defaults,
  ...process.env,
};

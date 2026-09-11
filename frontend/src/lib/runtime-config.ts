// Public, non-secret deployment config (API base URL, OAuth client IDs, crowdsourcing API
// URL) loaded at runtime from a static JSON file instead of baked in at Vite build time.
// This project ships one prebuilt Docker image for every self-hoster, so anything baked in
// at build time can never be configured per-deployment — see frontend/public/runtime-config.json
// (the checked-in default/template) and docker-compose.yml (mounts a self-hoster's own copy
// over it). main.tsx awaits loadRuntimeConfig() before the rest of the app is even imported,
// so every other module can read `runtimeConfig` synchronously as if it were a constant.
export interface RuntimeConfig {
  apiUrl: string
  googleClientId: string
  githubClientId: string
  crowdsourceApiUrl: string
}

const DEFAULTS: RuntimeConfig = {
  apiUrl: "",
  googleClientId: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  githubClientId: "YOUR_GITHUB_CLIENT_ID",
  crowdsourceApiUrl: "",
}

export let runtimeConfig: RuntimeConfig = { ...DEFAULTS }

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const res = await fetch("/runtime-config.json")
    if (res.ok) {
      runtimeConfig = { ...DEFAULTS, ...(await res.json()) }
    }
  } catch {
    // Network hiccup or missing file — keep defaults so the app still boots
    // (SSO buttons just won't be configured until the file is reachable).
  }
  return runtimeConfig
}

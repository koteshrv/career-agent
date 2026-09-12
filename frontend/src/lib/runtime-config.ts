export interface RuntimeConfig {
  apiUrl: string
  crowdsourceApiUrl: string
}

const DEFAULTS: RuntimeConfig = {
  apiUrl: "",
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
    // Keep defaults
  }
  return runtimeConfig
}

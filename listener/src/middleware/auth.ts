/**
 * API Key Authentication Middleware
 *
 * Authenticates incoming requests via Bearer token authentication.
 * API keys are loaded from environment variables at startup with format:
 * BITVILLE_API_KEY_PROJECTNAME=actual-api-key-uuid
 *
 * This satisfies LIST-03 (authorization requirement) via application-level
 * API key validation. Network firewall configuration is out of scope.
 */

export interface AuthContext {
  projectKey: string;
  isValid: boolean;
  error?: string;
}

// Cache API keys at module initialization (not per-request for performance)
// Map: apiKey -> projectName (lowercase)
const apiKeyCache = new Map<string, string>();

/**
 * Load API keys from environment variables into cache
 *
 * Scans for environment variables matching pattern:
 * BITVILLE_API_KEY_PROJECTNAME=actual-api-key
 *
 * Called automatically at module initialization.
 */
function loadApiKeys(): void {
  apiKeyCache.clear();

  // Scan environment for API key variables
  for (const [key, value] of Object.entries(Bun.env)) {
    if (key.startsWith("BITVILLE_API_KEY_") && value) {
      // Extract project name from variable name
      // BITVILLE_API_KEY_TESTPROJECT -> testproject
      const projectName = key
        .replace("BITVILLE_API_KEY_", "")
        .toLowerCase();

      // Store in cache: apiKey -> projectName
      apiKeyCache.set(value, projectName);
    }
  }
}

/**
 * Refresh API key cache from environment
 *
 * Call this to reload API keys without server restart
 * (useful for runtime configuration updates)
 */
export function refreshApiKeys(): void {
  loadApiKeys();
}

/**
 * Get count of loaded API keys (for diagnostics)
 */
export function getApiKeyCount(): number {
  return apiKeyCache.size;
}

/**
 * Authenticate request via Bearer token
 *
 * @param req HTTP request
 * @returns AuthContext with validation result
 */
export function authenticateRequest(req: Request): AuthContext {
  // Extract Authorization header
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return {
      projectKey: "",
      isValid: false,
      error: "Missing Authorization header",
    };
  }

  // Check for "Bearer " prefix
  if (!authHeader.startsWith("Bearer ")) {
    return {
      projectKey: "",
      isValid: false,
      error: "Missing Bearer token",
    };
  }

  // Extract API key after "Bearer "
  const apiKey = authHeader.substring(7);

  if (!apiKey || apiKey.trim() === "") {
    return {
      projectKey: "",
      isValid: false,
      error: "Empty API key",
    };
  }

  // Look up API key in cache
  const projectName = apiKeyCache.get(apiKey);

  if (projectName) {
    return {
      projectKey: projectName,
      isValid: true,
    };
  }

  // Invalid API key
  return {
    projectKey: "",
    isValid: false,
    error: "Invalid API key",
  };
}

// Load API keys at module initialization
loadApiKeys();

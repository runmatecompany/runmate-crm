import { getApiUrl } from "./serverConfig";

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: "admin" | "user";
  };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${getApiUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  return response.json();
}

// Hitelesítést igénylő végpontokhoz: automatikusan ráteszi az Authorization fejlécet.
export async function authFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  return response;
}

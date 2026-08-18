import { authFetch } from "./api";

export interface UserAccess {
  leadsAccess: boolean;
  clientsAccess: boolean;
  socialMediaAccess: boolean;
  tasksAccess: boolean;
  leadGenAccess: boolean;
  emailModuleAccess: boolean;
  emailAccountIds: number[];
}

export async function getUserAccess(token: string, userId: number): Promise<UserAccess> {
  const res = await authFetch(token, `/admin/users/${userId}/access`);
  return res.json();
}

export async function setUserAccess(token: string, userId: number, input: UserAccess): Promise<void> {
  await authFetch(token, `/admin/users/${userId}/access`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

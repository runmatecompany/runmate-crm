import { authFetch } from "./api";

export interface UserAccess {
  leadsAccess: boolean;
  clientsAccess: boolean;
  socialMediaAccess: boolean;
  tasksAccess: boolean;
  leadGenAccess: boolean;
  webAccess: boolean;
  supportAccess: boolean;
  emailModuleAccess: boolean;
  emailAccountIds: number[];
}

export interface MyAccess {
  leadsAccess: boolean;
  clientsAccess: boolean;
  socialMediaAccess: boolean;
  tasksAccess: boolean;
  leadGenAccess: boolean;
  webAccess: boolean;
  supportAccess: boolean;
  emailModuleAccess: boolean;
}

export async function getUserAccess(token: string, userId: number): Promise<UserAccess> {
  const res = await authFetch(token, `/admin/users/${userId}/access`);
  return res.json();
}

// Saját jogosultságok — ez alapján dönti el a Sidebar, mely modul-
// menüpontokat mutassa (admin mindent lát, a végpont ezt már figyelembe
// veszi, nem kell itt külön kezelni).
export async function getMyAccess(token: string): Promise<MyAccess> {
  const res = await authFetch(token, "/me/access");
  return res.json();
}

export async function setUserAccess(token: string, userId: number, input: UserAccess): Promise<void> {
  await authFetch(token, `/admin/users/${userId}/access`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

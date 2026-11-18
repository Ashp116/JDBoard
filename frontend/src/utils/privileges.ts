import { useEffect, useState } from 'react';
import { getBackendUrl } from './api';

// Sent as the sudo password when the backend doesn't need one: the installed
// service runs admin actions through its own password-less helper.
export const PASSWORDLESS = 'passwordless';

export interface Privileges {
  passwordless: boolean;   // admin actions need no password at all
  adminPassword: boolean;  // installed service: they need the JDBoard admin password (not sudo)
}

let cached: Promise<Privileges> | null = null;

/** What admin actions (reboot, shutdown, cache, jtop service, start on boot)
 *  need. Asked once per page load. */
export const getPrivileges = (): Promise<Privileges> => {
  if (!cached) {
    cached = fetch(`${getBackendUrl()}/system/privileges`)
      .then(response => response.json())
      .then(data => ({ passwordless: !!data.passwordless, adminPassword: !!data.admin_password }))
      .catch(() => {
        cached = null;   // ask again next time
        return { passwordless: false, adminPassword: false };
      });
  }
  return cached;
};

export const isPasswordlessSudo = async (): Promise<boolean> => (await getPrivileges()).passwordless;

/** "admin password" (installed service) or "sudo password" (dev checkout),
 *  for the password prompts. */
export const usePasswordLabel = (): string => {
  const [label, setLabel] = useState('sudo password');
  useEffect(() => {
    let alive = true;
    getPrivileges().then(p => { if (alive) setLabel(p.adminPassword ? 'admin password' : 'sudo password'); });
    return () => { alive = false; };
  }, []);
  return label;
};

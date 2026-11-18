import { getBackendUrl } from './api';

// Sent as the sudo password when the backend doesn't need one: the installed
// service runs admin actions through its own password-less helper.
export const PASSWORDLESS = 'passwordless';

let cached: Promise<boolean> | null = null;

/** Whether reboot/shutdown/jtop service/cache actions need the user's sudo
 *  password. Asked once per page load. */
export const isPasswordlessSudo = (): Promise<boolean> => {
  if (!cached) {
    cached = fetch(`${getBackendUrl()}/system/privileges`)
      .then(response => response.json())
      .then(data => !!data.passwordless)
      .catch(() => {
        cached = null;   // ask again next time
        return false;
      });
  }
  return cached;
};

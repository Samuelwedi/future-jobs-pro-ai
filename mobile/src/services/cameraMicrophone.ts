// Scoped leases prevent a stale camera cleanup from releasing a newer camera session.
const owners = new Set<symbol>();
const listeners = new Set<(held: boolean) => Promise<void>>();
export const cameraMicrophoneHeld = () => owners.size > 0;
export function observeCameraMicrophone(listener: (held: boolean) => Promise<void>) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export async function acquireCameraMicrophone(): Promise<() => void> {
  const owner = Symbol('camera');
  owners.add(owner);
  const release = () => {
    if (!owners.delete(owner) || owners.size) return;
    for (const listener of listeners) void listener(false).catch(() => {});
  };
  try {
    await Promise.all([...listeners].map(listener => listener(true)));
    return release;
  } catch (error) { release(); throw error; }
}

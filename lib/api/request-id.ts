// Format: req_<timestamp>_<randomHex>
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36); // Base36 for compactness
  const randomHex = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${randomHex}`;
}

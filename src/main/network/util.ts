import { networkInterfaces } from 'os'

export function getLocalIp(): string {
  const nets = networkInterfaces()
  const candidates: string[] = []
  for (const interfaces of Object.values(nets)) {
    if (!interfaces) continue
    for (const net of interfaces) {
      if (net.family === 'IPv4' && !net.internal) {
        const addr = net.address
        if (addr.startsWith('169.254')) continue
        candidates.push(addr)
      }
    }
  }
  const preferred = candidates.find(
    (a) => a.startsWith('192.168.') || a.startsWith('10.') || a.startsWith('172.')
  )
  return preferred ?? candidates[0] ?? '127.0.0.1'
}

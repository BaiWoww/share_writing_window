import { networkInterfaces } from 'os'

export function getLocalIp(): string {
  const candidates = getIpv4Interfaces()
  const preferred = candidates.find(
    (a) => a.startsWith('192.168.') || a.startsWith('10.') || a.startsWith('172.')
  )
  return preferred ?? candidates[0] ?? '127.0.0.1'
}

export function getBroadcastAddresses(): string[] {
  const result: string[] = []
  const nets = networkInterfaces()
  for (const interfaces of Object.values(nets)) {
    if (!interfaces) continue
    for (const net of interfaces) {
      if (net.family === 'IPv4' && !net.internal) {
        const broadcast = computeBroadcast(net.address, net.netmask)
        if (broadcast && !broadcast.startsWith('169.254')) {
          result.push(broadcast)
        }
      }
    }
  }
  if (result.length === 0) result.push('255.255.255.255')
  return result
}

function getIpv4Interfaces(): string[] {
  const out: string[] = []
  const nets = networkInterfaces()
  for (const interfaces of Object.values(nets)) {
    if (!interfaces) continue
    for (const net of interfaces) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!net.address.startsWith('169.254')) out.push(net.address)
      }
    }
  }
  return out
}

function computeBroadcast(ip: string, netmask: string): string | null {
  const ipParts = ip.split('.').map(Number)
  const maskParts = netmask.split('.').map(Number)
  if (ipParts.length !== 4 || maskParts.length !== 4) return null
  if (ipParts.some((n) => Number.isNaN(n)) || maskParts.some((n) => Number.isNaN(n))) {
    return null
  }
  const broadcast = ipParts.map((ipPart, i) => (ipPart & maskParts[i]) | (~maskParts[i] & 255))
  return broadcast.join('.')
}

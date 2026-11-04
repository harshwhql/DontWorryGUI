/**
 * A single probe that teaches the app everything it needs to know about a
 * freshly connected box: distro, package manager, init system, privileges.
 * Written to be POSIX-sh safe so it works on Debian, RHEL, Alpine and friends.
 */
export const FACTS_SCRIPT = [
  `echo "user=$(id -un 2>/dev/null)"`,
  `echo "uid=$(id -u 2>/dev/null)"`,
  `echo "shell=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)"`,
  `if [ -r /etc/os-release ]; then . /etc/os-release; echo "pretty=$PRETTY_NAME"; echo "distro=$ID"; echo "ver=$VERSION_ID"; fi`,
  `echo "kernel=$(uname -r)"`,
  `echo "arch=$(uname -m)"`,
  `echo "host=$(hostname 2>/dev/null || uname -n)"`,
  `echo "cores=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)"`,
  `echo "cpumodel=$(awk -F': ' '/model name/{print $2; exit}' /proc/cpuinfo 2>/dev/null || awk -F': ' '/Model/{print $2; exit}' /proc/cpuinfo 2>/dev/null)"`,
  `echo "memtotal=$(awk '/^MemTotal/{print $2*1024; exit}' /proc/meminfo 2>/dev/null)"`,
  `echo "boot=$(awk '{print int($1); exit}' /proc/uptime 2>/dev/null)"`,
  `if command -v sudo >/dev/null 2>&1; then echo "sudo=1"; else echo "sudo=0"; fi`,
  `if command -v systemctl >/dev/null 2>&1; then echo "systemd=1"; else echo "systemd=0"; fi`,
  `if command -v docker >/dev/null 2>&1; then echo "docker=$(docker --version 2>/dev/null | head -n1)"; fi`,
  `for p in apt-get dnf yum pacman zypper apk; do if command -v $p >/dev/null 2>&1; then case $p in apt-get) echo "pm=apt";; *) echo "pm=$p";; esac; break; fi; done`,
  `if command -v ufw >/dev/null 2>&1; then echo "fw=ufw"; elif command -v firewall-cmd >/dev/null 2>&1; then echo "fw=firewalld"; elif command -v iptables >/dev/null 2>&1; then echo "fw=iptables"; else echo "fw=none"; fi`,
  `if command -v systemd-detect-virt >/dev/null 2>&1; then echo "virt=$(systemd-detect-virt 2>/dev/null)"; fi`
].join('; ')

export function parseFacts(stdout: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key && value) map.set(key, value)
  }
  return map
}

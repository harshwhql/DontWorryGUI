import type { DockerContainer, DockerImage, DockerStat, DockerVolume } from '@shared/types'
import { defineActions } from './types'
import { q } from './system'

function ndjson<T>(stdout: string): T[] {
  const rows: T[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      rows.push(JSON.parse(trimmed) as T)
    } catch {
      /* skip malformed line */
    }
  }
  return rows
}

function percent(value: string | undefined): number {
  const num = Number(String(value ?? '').replace('%', ''))
  return Number.isFinite(num) ? num : 0
}

export const dockerActions = defineActions([
  {
    id: 'docker.containers',
    label: 'List containers',
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 30_000,
    build: () => `docker ps -a --no-trunc --format '{{json .}}'`,
    parse: (out): DockerContainer[] =>
      ndjson<Record<string, string>>(out.stdout).map((row) => ({
        id: (row.ID ?? '').slice(0, 12),
        name: row.Names ?? '',
        image: row.Image ?? '',
        command: (row.Command ?? '').replace(/^"|"$/g, ''),
        state: (row.State ?? '').toLowerCase(),
        status: row.Status ?? '',
        ports: row.Ports ?? '',
        createdAt: row.CreatedAt ?? '',
        size: row.Size
      }))
  },
  {
    id: 'docker.images',
    label: 'List images',
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: () => `docker images --format '{{json .}}'`,
    parse: (out): DockerImage[] =>
      ndjson<Record<string, string>>(out.stdout).map((row) => ({
        id: (row.ID ?? '').replace('sha256:', '').slice(0, 12),
        repository: row.Repository ?? '<none>',
        tag: row.Tag ?? '<none>',
        size: row.Size ?? '',
        createdSince: row.CreatedSince ?? ''
      }))
  },
  {
    id: 'docker.volumes',
    label: 'List volumes',
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: () => `docker volume ls --format '{{json .}}'`,
    parse: (out): DockerVolume[] =>
      ndjson<Record<string, string>>(out.stdout).map((row) => ({
        name: row.Name ?? '',
        driver: row.Driver ?? '',
        mountpoint: row.Mountpoint ?? ''
      }))
  },
  {
    id: 'docker.networks',
    label: 'List networks',
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: () => `docker network ls --format '{{json .}}'`,
    parse: (out) =>
      ndjson<Record<string, string>>(out.stdout).map((row) => ({
        id: (row.ID ?? '').slice(0, 12),
        name: row.Name ?? '',
        driver: row.Driver ?? '',
        scope: row.Scope ?? ''
      }))
  },
  {
    id: 'docker.stats',
    label: 'Sample container resource use',
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 40_000,
    build: () => `docker stats --no-stream --format '{{json .}}'`,
    parse: (out): DockerStat[] =>
      ndjson<Record<string, string>>(out.stdout).map((row) => ({
        id: (row.ID ?? '').slice(0, 12),
        name: row.Name ?? '',
        cpuPercent: percent(row.CPUPerc),
        memUsage: row.MemUsage ?? '',
        memPercent: percent(row.MemPerc),
        netIO: row.NetIO ?? '',
        blockIO: row.BlockIO ?? ''
      }))
  },
  {
    id: 'docker.logs',
    label: (p: { id: string }) => `Read logs for ${p.id}`,
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 40_000,
    build: (p: { id: string; lines?: number }) =>
      `docker logs --tail ${Number(p.lines ?? 400)} --timestamps ${q(p.id)} 2>&1`,
    parse: (out) => out.stdout
  },
  {
    id: 'docker.inspect',
    label: (p: { id: string }) => `Inspect ${p.id}`,
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { id: string }) => `docker inspect ${q(p.id)}`,
    parse: (out) => out.stdout
  },
  {
    id: 'docker.top',
    label: (p: { id: string }) => `Processes inside ${p.id}`,
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { id: string }) => `docker top ${q(p.id)}`,
    parse: (out) => out.stdout
  },
  {
    id: 'docker.start',
    label: (p: { id: string }) => `Start container ${p.id}`,
    category: 'Docker',
    risk: 'write',
    privileged: true,
    timeoutMs: 120_000,
    build: (p: { id: string }) => `docker start ${q(p.id)}`
  },
  {
    id: 'docker.stop',
    label: (p: { id: string }) => `Stop container ${p.id}`,
    category: 'Docker',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 120_000,
    build: (p: { id: string }) => `docker stop ${q(p.id)}`
  },
  {
    id: 'docker.restart',
    label: (p: { id: string }) => `Restart container ${p.id}`,
    category: 'Docker',
    risk: 'write',
    privileged: true,
    timeoutMs: 180_000,
    build: (p: { id: string }) => `docker restart ${q(p.id)}`
  },
  {
    id: 'docker.pause',
    label: (p: { id: string }) => `Pause container ${p.id}`,
    category: 'Docker',
    risk: 'write',
    privileged: true,
    build: (p: { id: string }) => `docker pause ${q(p.id)}`
  },
  {
    id: 'docker.unpause',
    label: (p: { id: string }) => `Resume container ${p.id}`,
    category: 'Docker',
    risk: 'write',
    privileged: true,
    build: (p: { id: string }) => `docker unpause ${q(p.id)}`
  },
  {
    id: 'docker.remove',
    label: (p: { id: string }) => `Delete container ${p.id}`,
    category: 'Docker',
    risk: 'destructive',
    privileged: true,
    description: 'The container and anything written outside a volume is gone.',
    build: (p: { id: string; force?: boolean }) =>
      `docker rm ${p.force ? '-f ' : ''}${q(p.id)}`
  },
  {
    id: 'docker.removeImage',
    label: (p: { id: string }) => `Delete image ${p.id}`,
    category: 'Docker',
    risk: 'destructive',
    privileged: true,
    build: (p: { id: string; force?: boolean }) => `docker rmi ${p.force ? '-f ' : ''}${q(p.id)}`
  },
  {
    id: 'docker.removeVolume',
    label: (p: { name: string }) => `Delete volume ${p.name}`,
    category: 'Docker',
    risk: 'destructive',
    privileged: true,
    description: 'Everything stored in that volume is deleted.',
    build: (p: { name: string }) => `docker volume rm ${q(p.name)}`
  },
  {
    id: 'docker.pull',
    label: (p: { image: string }) => `Pull ${p.image}`,
    category: 'Docker',
    risk: 'write',
    privileged: true,
    timeoutMs: 900_000,
    build: (p: { image: string }) => `docker pull ${q(p.image)}`,
    parse: (out) => out.stdout
  },
  {
    id: 'docker.prune',
    label: 'Reclaim space from unused Docker data',
    category: 'Docker',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 600_000,
    description: 'Removes stopped containers, dangling images, unused networks and the build cache.',
    build: () => `docker system prune -f`,
    parse: (out) => out.stdout
  },
  {
    id: 'docker.diskUsage',
    label: 'Show Docker disk usage',
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    build: () => `docker system df`,
    parse: (out) => out.stdout
  },
  {
    id: 'docker.composePs',
    label: (p: { dir: string }) => `Compose status in ${p.dir}`,
    category: 'Docker',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 60_000,
    build: (p: { dir: string }) => `cd ${q(p.dir)} && docker compose ps --format '{{json .}}'`,
    parse: (out) => ndjson<Record<string, string>>(out.stdout)
  },
  {
    id: 'docker.composeUp',
    label: (p: { dir: string }) => `Compose up in ${p.dir}`,
    category: 'Docker',
    risk: 'write',
    privileged: true,
    timeoutMs: 1_800_000,
    build: (p: { dir: string }) => `cd ${q(p.dir)} && docker compose up -d`,
    parse: (out) => out.stdout + out.stderr
  },
  {
    id: 'docker.composeDown',
    label: (p: { dir: string }) => `Compose down in ${p.dir}`,
    category: 'Docker',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 600_000,
    build: (p: { dir: string }) => `cd ${q(p.dir)} && docker compose down`,
    parse: (out) => out.stdout + out.stderr
  }
])

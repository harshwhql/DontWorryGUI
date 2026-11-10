# DontWorryGUI

A desktop app for administering headless Linux servers over SSH. It gives you a real interface
for files, services, processes, packages, containers, users, firewall rules and cron jobs, and
it shows you the shell command behind every button.

## Why

Server GUIs usually hide the commands they run, which makes them hard to trust and impossible
to learn from. This one does the opposite.

Every action in the app is an entry in a command registry: an id, a label, a risk level, the
command, and a parser for the output. There is no second code path that bypasses it. That one
constraint gets you:

* A `</>` button next to every action, showing the exact string that will be sent to the remote
  shell, with **Copy** and **Run in terminal instead**.
* A command log docked at the bottom of the window with the timestamp, risk, command, exit code,
  duration and output of everything that ran. Background metric polls appear dimmed so they
  don't bury the commands you triggered.
* A dry run switch that prints the command for every write and executes nothing.
* Confirmation dialogs that show the literal command. The most destructive ones make you type
  `confirm` before the button unlocks.

## What it manages

| Section | |
|---|---|
| Overview | CPU per core, memory, swap, disks, network throughput, load, uptime and temperature, sampled from `/proc` with sparklines. Alerts for failed units and pending updates. |
| Processes | Sortable process table, a `/proc` inspector, SIGTERM/SIGKILL and `renice`. |
| Files | SFTP browser with a text editor, upload and download, a permission grid that stays in sync with the octal value, ownership, rename, copy, move, tar and zip, name search and content grep. |
| Services | Every systemd unit with its active and boot state. Start, stop, restart, reload, enable, disable, unit properties, `systemctl status` and the unit's journal. |
| Packages | apt, dnf, yum, pacman, zypper and apk behind one interface: pending updates, installed list, repository search, install, remove, purge, index refresh, orphan cleanup. |
| Scheduled jobs | Per-user crontabs and `/etc/cron.d`, each schedule translated into plain English, with a schedule builder, enable and disable, run now, a raw crontab editor and systemd timers. |
| Network | Listening sockets with their owning processes, flagging anything bound to `0.0.0.0`. Interfaces, routes, DNS, established connections, ping, traceroute, throughput test, and ufw or firewalld rules. |
| Users | Accounts and groups, lock and unlock, password changes, login shell, group membership and `authorized_keys`. |
| Containers | Docker containers with live CPU and memory, images, volumes, networks, logs, inspect, lifecycle controls, pull, prune, and a shell into any container. |
| Logs | The systemd journal with unit and priority filters and server-side grep, the kernel ring buffer, files under `/var/log`, a follow mode, severity colouring, and a view for failed sign-ins and failed units. |
| Terminal | Real SSH shell channels in tabs, using xterm.js with 256 colour, search and adjustable text size. |

Sections the server cannot support are disabled with the reason shown rather than hidden. If
there is no systemd, Services says so.

## Themes

Six themes ship with the app: **Midnight** (the default dark navy), **Yaru Dark** and **Yaru
Light** which borrow Ubuntu's aubergine greys, orange and the Ubuntu typeface, **Fedora**,
**Debian**, and **Graphite Light**.

Pick a default under Settings, and give any individual server its own in that server's
connection settings. The theme follows whichever server is active, which is the point: staging
can be light and production can be Debian crimson, so a glance at the window tells you where you
are about to run something. The terminal palette, the native window frame and the scrollbars
all follow along.

Brand colour and status colour are separate. `accent` drives primary buttons, the active
section, focus rings and selection, so it carries the theme's identity. Green still means
succeeded, amber still means careful and red still means destructive, in every theme.

Density is a separate setting: compact, comfortable or spacious, changing row heights and the
base text size.

Adding a theme means adding one object to `src/shared/themes.ts`. Then run:

```bash
npm run themes:check
```

That walks every text-on-surface pair in each theme and fails if any falls below its WCAG
target, which is easy to do by accident: a colour that reads well on a dark panel usually does
not on a light one.

## Running it

Needs Node.js 20 or newer and a Linux server you can reach over SSH.

```bash
npm install
```

```bash
npm run dev
```

If `npm install` skipped the Electron binary download, which happens behind some proxies and
with `--ignore-scripts`, fetch it once:

```bash
node node_modules/electron/install.js
```

### Building a Windows installer

```bash
npm run dist:win
```

This produces `release/DontWorryGUI-1.0.0-setup.exe`, an NSIS installer of about 121 MB. It
installs per user, so it needs no administrator rights, and it creates desktop and Start menu
shortcuts. The unpacked application sits next to it in `release/win-unpacked/` if you would
rather run it without installing.

`npm run build` compiles without packaging. `npm run dist` packages to a folder only.

Two things to know about the output:

* No code signing certificate is configured, so SmartScreen will warn on first run. Set
  `CSC_LINK` and `CSC_KEY_PASSWORD` to sign.
* `cpu-features`, an optional native dependency of `ssh2`, fails to rebuild when the project
  path contains a space. That is a node-gyp limitation. `ssh2` wraps the import in a
  `try`/`catch` and only uses it to pick ciphers, so SSH works without it.

The app icon is generated from code rather than committed as a binary. Edit the shape in
`scripts/make-icon.mjs` and run `npm run icon`.

## Connecting

Add a server with the **+** in the left rail. Password, private key and SSH agent
authentication all work.

On connect the app probes the box once and adapts to what it finds: distribution, kernel, CPU,
package manager, init system, firewall backend, Docker, and whether you are root or have sudo.

Privileged commands are wrapped as `sudo -S -p '' sh -c '<command>'` with the password written
to stdin, so it never appears in a command string, a log line or the process table.

SFTP cannot escalate privileges. When the file browser is denied by permissions it retries
through the shell with sudo, using `find -printf`, `base64` and `tee`, and the command log
records that it did.

## Credentials

Passwords, key passphrases and sudo passwords are stored on your machine only, in the app's data
directory, sealed with the OS keystore: DPAPI on Windows, Keychain on macOS, libsecret on Linux.
The renderer process never receives them, only `••••••••`. The status bar shows whether the
keystore was available and warns you if it was not.

The renderer runs with context isolation on and Node integration off. It reaches the SSH layer
through a typed IPC bridge, and external navigation is blocked.

## Testing against a real server

`scripts/smoke-test.ts` connects to a live box, runs every read-only action in the registry and
prints what each command returned and how it parsed. It then exercises the sudo write path, an
SFTP round trip and an interactive shell channel. It is the quickest way to check a command or
parser against a distribution you have not tried.

Start a throwaway target:

```bash
docker run -d --name dwg-test -p 2222:22 debian:12 bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server sudo procps iproute2 cron >/dev/null && mkdir -p /run/sshd && echo 'root:testpass123' | chpasswd && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && /usr/sbin/sshd -D -e"
```

```bash
DWG_HOST=127.0.0.1 DWG_PORT=2222 DWG_USER=root DWG_PASS=testpass123 npm run smoke
```

Run it as a non-root user too, which is the case that exercises sudo and the SFTP fallback.

Type checking is `npm run typecheck`, and `npm run themes:check` validates theme contrast.

## Layout

```
src/
  shared/          types and IPC channel names used by both sides
  main/
    ssh/           connection pool, privileged exec, SFTP helpers, shell channels
    actions/       the command registry, one module per domain
    ipc/           the typed bridge surface
    store/         host book and settings, secrets sealed with safeStorage
  preload/         contextBridge API, the only thing the renderer can call
  renderer/src/
    components/    UI kit, app shell, command inspector, command palette
    features/      one folder per section
    state/         zustand store, including the run() every action goes through
```

Adding a capability means adding one registry entry:

```ts
{
  id: 'services.restart',
  label: (p) => `Restart ${p.unit}`,
  category: 'Services',
  risk: 'write',
  privileged: true,
  description: 'Brief downtime while the service comes back up.',
  build: (p) => `systemctl restart ${q(p.unit)}`
}
```

That object produces the command preview, the confirmation copy, the dry run behaviour, the
audit entry and a command palette entry.

## Keyboard

| Shortcut | |
|---|---|
| <kbd>Ctrl</kbd> <kbd>K</kbd> | Command palette. Jump to a section, switch server, run an action. Start with `$` to compose a raw command. |
| <kbd>Ctrl</kbd> <kbd>`</kbd> | Terminal |
| <kbd>Ctrl</kbd> <kbd>1</kbd> | Overview |
| <kbd>Esc</kbd> | Close dialog, popover or palette |

## Limits

* Built for Linux servers. BSD and macOS hosts will connect and the terminal works, but the
  parsers assume GNU/Linux tooling: `/proc`, `systemctl`, `ss`, GNU `find`.
* Log follow re-polls on an interval instead of streaming `journalctl -f`. Use the terminal for
  a true live tail.
* Jump hosts and `~/.ssh/config` parsing are not implemented.

## Built with

Electron, React, TypeScript, Vite, Tailwind CSS, [ssh2](https://github.com/mscdex/ssh2) and
[xterm.js](https://xtermjs.org/).

## Licence

MIT. See [LICENSE](LICENSE).

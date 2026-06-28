#!/usr/bin/env bash
# =====================================================================
# BRSR AI Platform v2 -- Fresh Hostinger VPS bootstrap
# Run as root on a clean Ubuntu 24.04 KVM instance.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/brsr-v2/main/scripts/install-vps.sh \
#     | sudo REPO_URL=https://github.com/<owner>/brsr-v2.git bash
#
# Idempotent: re-running on an already-bootstrapped host is safe.
# =====================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YOUR_USER/brsr-v2.git}"
APP_USER="${APP_USER:-brsr}"

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root (use sudo)." >&2
  exit 1
fi

log()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }

log "=== BRSR AI Platform -- VPS Bootstrap ==="

# --- 1. System update -----------------------------------------------
export DEBIAN_FRONTEND=noninteractive
log "apt update + upgrade"
apt-get update -y
apt-get upgrade -y

# --- 2. Essentials ---------------------------------------------------
log "Installing essential packages"
apt-get install -y --no-install-recommends \
  curl \
  ca-certificates \
  gnupg \
  git \
  ufw \
  fail2ban \
  htop \
  unattended-upgrades \
  jq \
  rsync

# --- 3. Docker engine + compose plugin ------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
else
  log "Docker already installed -> $(docker --version)"
fi
systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
  warn "docker compose plugin missing; installing"
  apt-get install -y docker-compose-plugin
fi
docker --version
docker compose version

# --- 4. Firewall (UFW) ----------------------------------------------
log "Configuring UFW firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     comment 'SSH'
ufw allow 80/tcp     comment 'HTTP (Caddy)'
ufw allow 443/tcp    comment 'HTTPS (Caddy)'
ufw allow 443/udp    comment 'HTTP/3 QUIC'
ufw --force enable
ufw status verbose || true

# --- 5. fail2ban (SSH bruteforce) -----------------------------------
log "Enabling fail2ban for SSH"
cat >/etc/fail2ban/jail.d/sshd-brsr.conf <<'EOF'
[sshd]
enabled = true
port    = ssh
filter  = sshd
backend = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# --- 6. Unattended security upgrades --------------------------------
log "Enabling unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades || true

# --- 7. App user -----------------------------------------------------
if id "$APP_USER" >/dev/null 2>&1; then
  log "User '$APP_USER' already exists"
else
  log "Creating app user '$APP_USER'"
  useradd -m -s /bin/bash "$APP_USER"
fi
usermod -aG docker "$APP_USER"

# Forward authorized_keys if running as root with key auth.
if [[ -f /root/.ssh/authorized_keys ]]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
  install -m 600 -o "$APP_USER" -g "$APP_USER" \
    /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
fi

# --- 8. Swap (important for 16GB nodes running heavy AI workloads) --
if ! swapon --show | grep -q '/swapfile'; then
  log "Creating 8G swapfile"
  fallocate -l 8G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' >/etc/sysctl.d/99-brsr-swap.conf
else
  log "Swap already configured"
fi

# --- 9. Clone repo ---------------------------------------------------
APP_DIR="/home/$APP_USER/brsr-v2"
if [[ -d "$APP_DIR/.git" ]]; then
  log "Repo already cloned -> git pull"
  sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && git pull --ff-only" || warn "pull failed"
else
  log "Cloning $REPO_URL -> $APP_DIR"
  sudo -u "$APP_USER" bash -lc "git clone '$REPO_URL' '$APP_DIR'" \
    || warn "clone failed; clone manually as user '$APP_USER'"
fi

# --- 10. Done --------------------------------------------------------
cat <<EOF

------------------------------------------------------------
 VPS bootstrapped successfully.

 Next steps:
   su - $APP_USER
   cd brsr-v2
   cp .env.production.example .env
   nano .env                    # fill DOMAIN, secrets, OPENAI_API_KEY
   SEED_DB=true ./scripts/deploy.sh
------------------------------------------------------------
EOF

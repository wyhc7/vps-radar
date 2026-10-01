#!/usr/bin/env bash
# vps-radar 探针一键安装/上报脚本
# 用法:
#   安装: bash agent.sh <WORKER_URL> <SERVER_ID> <TOKEN>
#   上报: bash agent.sh            (读取 /etc/vps-radar.conf)
set -u

CONF=/etc/vps-radar.conf
UNIT=/etc/systemd/system/vps-radar-agent.service
BIN=/usr/local/bin/vps-radar-agent

# ---------- 安装模式 ----------
if [ $# -ge 3 ]; then
  URL="${1%/}"; SID="$2"; TOKEN="$3"
  [ "$(id -u)" = 0 ] || { echo "需要 root 运行安装"; exit 1; }
  mkdir -p /etc
  cat > "$CONF" <<EOF
URL="$URL"
ID="$SID"
TOKEN="$TOKEN"
INTERVAL=10
EOF
  chmod 600 "$CONF"
  # 本地文件执行时直接复制；管道执行（bash <(curl ...)）时 $0 是已读空的
  # /dev/fd/63，复制会拿到空文件，必须校验后回退到重新下载
  cp "$0" "$BIN" 2>/dev/null
  if ! head -c2 "$BIN" 2>/dev/null | grep -q '#!'; then
    curl -fsSL "$URL/agent.sh" -o "$BIN" || { echo "下载探针失败"; exit 1; }
  fi
  chmod +x "$BIN"
  cat > "$UNIT" <<EOF
[Unit]
Description=vps-radar agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$BIN
Restart=always
RestartSec=5
Nice=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now vps-radar-agent
  echo "已安装并启动: systemctl status vps-radar-agent"
  exit 0
fi

# ---------- 上报模式 ----------
[ -f "$CONF" ] || { echo "缺少配置 $CONF"; exit 1; }
. "$CONF"
INTERVAL="${INTERVAL:-10}"

read_cpu() { read -r _ u n s i w irq si st _ < /proc/stat; echo "$u $n $s $i $w $irq $si $st"; }
read_net() { awk '/:/{sub(":","",$1); if($1!="lo"){rx+=$2; tx+=$10}} END{print rx, tx}' /proc/net/dev; }

set -- $(read_cpu); PB=$(( $1+$2+$3 )); PI=$4; PT=$(( PB+PI+$5+$6+$7+$8 ))
set -- $(read_net); PRX=$1; PTX=$2
PREV_TS=$(date +%s%N)

while :; do
  sleep "$INTERVAL"
  NOW_TS=$(date +%s%N); DT=$(( (NOW_TS-PREV_TS)/1000000 )); PREV_TS=$NOW_TS
  [ "$DT" -le 0 ] && DT=$((INTERVAL*1000))

  set -- $(read_cpu); B=$(( $1+$2+$3 )); I=$4; T=$(( B+I+$5+$6+$7+$8 ))
  D_B=$(( B-PB )); D_T=$(( T-PT )); PB=$B; PT=$T
  CPU=$(awk "BEGIN{printf \"%.2f\", ($D_T>0)?$D_B/$D_T*100:0}")

  set -- $(read_net); RX=$1; TX=$2
  RXS=$(awk "BEGIN{printf \"%.0f\", ($RX-$PRX)/($DT/1000)}")
  TXS=$(awk "BEGIN{printf \"%.0f\", ($TX-$PTX)/($DT/1000)}")
  PRX=$RX; PTX=$TX

  LOAD1=$(cut -d' ' -f1 /proc/loadavg)
  UPTIME=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)

  MEM_T=$(awk '/MemTotal/{print $2*1024}' /proc/meminfo)
  MEM_A=$(awk '/MemAvailable/{print $2*1024}' /proc/meminfo)
  MEM_U=$(( MEM_T-MEM_A ))
  SW_T=$(awk '/SwapTotal/{print $2*1024}' /proc/meminfo)
  SW_F=$(awk '/SwapFree/{print $2*1024}' /proc/meminfo)
  SW_U=$(( SW_T-SW_F ))

  set -- $(df -B1 -x tmpfs -x devtmpfs -x overlay --total 2>/dev/null | awk '/^total/{print $2, $3}')
  DSK_T=${1:-0}; DSK_U=${2:-0}

  OS=$( (. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-Linux}") | tr -d '"')
  NAME=$(hostname)
  IP=$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null \
     || curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo "")

  PAYLOAD=$(cat <<EOF
{"id":"$ID","name":"$NAME","os":"$OS","ip":"$IP",
"cpu":$CPU,"load1":$LOAD1,
"mem_total":$MEM_T,"mem_used":$MEM_U,"swap_total":$SW_T,"swap_used":$SW_U,
"disk_total":$DSK_T,"disk_used":$DSK_U,
"net_rx":$RXS,"net_tx":$TXS,"net_rx_total":$RX,"net_tx_total":$TX,"uptime":$UPTIME}
EOF
)
  curl -fsS --max-time 10 -X POST "$URL/api/report" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null 2>&1 || true
done

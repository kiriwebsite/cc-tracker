#!/usr/bin/env bash
#
# 部署到 kiri.icantw.com/cc-tracker/（公司的 nginx，跟個人 GitHub Pages 各走各的）。
#
# 跟 CI 那條線的差別：這裡刻意建置成「無同步服務」版本。
# .env.local 的 VITE_SYNC_API 指向個人 Cloudflare Worker，而該 Worker 的 CORS
# 白名單只有 kiriwebsite.github.io——公司站呼叫必定被擋，使用者只會看到
# 「連不上同步服務，檢查網路」這種誤導訊息。留空反而會走 UI 既有的
# 「尚未設定同步服務」分支，訊息誠實，其餘功能一律正常。
# 順帶讓公司站完全不碰個人資源，兩邊沒有任何執行期依賴。
#
# 用法：npm run deploy:kiri
# 覆寫預設值：DEPLOY_HOST=1.2.3.4 npm run deploy:kiri

set -euo pipefail

# 用 IP 不用網域：known_hosts 記的是 IP，走網域會跳未知主機金鑰的確認
DEPLOY_HOST="${DEPLOY_HOST:-35.201.157.134}"
DEPLOY_USER="${DEPLOY_USER:-kiri}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/html/kiri.icantw.com/cc-tracker}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/google_compute_engine}"
SITE_URL="${SITE_URL:-https://kiri.icantw.com/cc-tracker/}"
# 公司站要用的同步服務網址。空＝不啟用（UI 顯示「尚未設定同步服務」）。
# 公司自己部署了 Worker 之後填在這裡，或用環境變數帶進來。
# 千萬不要填個人那支——見下面的防護
DEPLOY_SYNC_API="${DEPLOY_SYNC_API:-}"

cd "$(dirname "$0")/.."

SSH_CMD="ssh -i $DEPLOY_KEY -o BatchMode=yes -o ConnectTimeout=10"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -f "$DEPLOY_KEY" ] || die "找不到 SSH 金鑰 $DEPLOY_KEY"

step "檢查連線"
$SSH_CMD "$DEPLOY_USER@$DEPLOY_HOST" 'echo "  已連上 $(hostname)"' \
  || die "連不上 $DEPLOY_USER@$DEPLOY_HOST（金鑰過期？改用 gcloud compute ssh 重新配一次）"

# .env.local 的優先權高於環境變數，光是 VITE_SYNC_API= 蓋不掉，只能整個移開。
# trap 確保不管是失敗、中斷還是正常結束都會還原——這個檔沒進版控，弄丟就得重打。
# 個人 Worker 的網址：拿來當「絕對不能出現在公司版產物裡」的比對基準。
# 不能粗略地擋所有 workers.dev——公司自己部署的 Worker 也在那個網域下
PERSONAL_SYNC=$(sed -n 's/^VITE_SYNC_API=//p' .env.local 2>/dev/null | head -1 | tr -d '"'"'"' \r')
PERSONAL_HOST=$(printf '%s' "$PERSONAL_SYNC" | sed -E 's#^https?://##; s#/.*$##')

if [ -n "$DEPLOY_SYNC_API" ] && [ -n "$PERSONAL_HOST" ] \
   && printf '%s' "$DEPLOY_SYNC_API" | grep -qF "$PERSONAL_HOST"; then
  die "DEPLOY_SYNC_API 指向個人的 Worker（$PERSONAL_HOST）。公司站要用公司自己的那支，見 worker/README.md"
fi

# 每日底圖：build 不會自己抓（抓圖掛在 predev 上），少了這行就會把上次部署
# 留在 public/ 的舊圖原封再貼一次，公司站的底圖等於凍結在第一次部署那天。
# 必須放在移開 .env.local 之前——正式站那份取不到而要退回打 NASA API 時，
# 金鑰是從 .env.local 讀的。抓失敗不中止部署，沿用既有的圖照樣上線
step "更新 APOD 底圖"
npm run apod || echo "  抓圖失敗，沿用 public/ 既有的圖"

step "建置（暫時移開 .env.local）"
ENV_MOVED=0
restore_env() {
  if [ "$ENV_MOVED" = "1" ] && [ -f .env.local.deploybak ]; then
    mv .env.local.deploybak .env.local
    echo "  .env.local 已還原"
  fi
}
trap restore_env EXIT INT TERM

if [ -f .env.local ]; then
  mv .env.local .env.local.deploybak
  ENV_MOVED=1
fi
VITE_SYNC_API="$DEPLOY_SYNC_API" npm run build

step "驗證產物沒有夾帶個人資源"
# 注意：grep 要用 -q 直接判斷結束碼。串 | head 的話判斷到的是 head 的結束碼，
# head 永遠回 0，檢查會全部通過（踩過一次）
for needle in $PERSONAL_HOST kiriwebsite.github.io; do
  [ -n "$needle" ] || continue
  if grep -rqF "$needle" dist/; then
    die "產物含有 $needle，公司站會依賴個人資源，中止部署"
  fi
  echo "  ✓ 不含 $needle"
done

if [ -n "$DEPLOY_SYNC_API" ]; then
  grep -rqF "$DEPLOY_SYNC_API" dist/assets/ \
    || die "指定了 DEPLOY_SYNC_API 但產物裡找不到，可能沒吃到環境變數"
  echo "  ✓ 同步指向公司自己的 $DEPLOY_SYNC_API"
else
  grep -rqF '尚未設定同步服務' dist/assets/ \
    || die "找不到「尚未設定同步服務」的 UI 分支，同步可能沒被正確關掉"
  echo "  ✓ 同步未啟用（走「尚未設定」分支）"
fi

step "上傳到 $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
$SSH_CMD "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p '$DEPLOY_PATH'"
# --delete 只作用在這個目錄，舊版殘留的 hash 檔名資源要清掉，
# 不然 sw.js 的 precache 清單和實體檔案會對不起來
rsync -az --delete -e "$SSH_CMD" dist/ "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/"
echo "  已同步 $(find dist -type f | wc -l | tr -d ' ') 個檔案"

step "驗證線上"
code=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL")
[ "$code" = "200" ] || die "$SITE_URL 回應 $code"
js=$(curl -s "$SITE_URL" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
[ -n "$js" ] || die "首頁抓不到 JS 資源路徑，可能沒部署對"
jscode=$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL$js")
[ "$jscode" = "200" ] || die "$js 回應 $jscode"
echo "  ✓ 首頁 200、$js 200"

printf '\n\033[32m完成：%s\033[0m\n' "$SITE_URL"
echo "（PWA 已加到主畫面的話，關掉再開才會換到新版）"

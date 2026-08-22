#!/usr/bin/env bash
# ============================================================
# Easy2Sound 日本镜像站 — 一键部署（方案 A）
# 静态前端 + Nginx 反代主站 API / uploads
#
# 用法（在镜像服务器上，Ubuntu/Debian）：
#   chmod +x setup-mirror.sh
#   sudo ./setup-mirror.sh
#
# 前置条件：
#   1. 已购买日本 VPS，系统 Ubuntu/Debian
#   2. 域名 DNS 已加 A 记录指向本机 IP（等 DNS 生效）
#   3. 前端文件已上传到 WEBROOT（见 README.md 的文件清单）
# ============================================================
set -e

# ========== 配置区（改这里） ==========
DOMAIN="mirror.easy2sound.xyz"        # 镜像站域名（①）
UPSTREAM="https://www.easy2sound.xyz" # 主站地址（③）——必须 https，主站 http 会 301 跳转而 nginx 不跟随
WEBROOT="/var/www/easy2sound"         # 前端文件目录（②）
# ======================================

# 从 UPSTREAM 提取纯域名（用于 Host 头）
MAIN_HOST="${UPSTREAM#http://}"
MAIN_HOST="${MAIN_HOST#https://}"

echo "==> [1/4] 安装 nginx（如未安装）"
if ! command -v nginx >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y nginx
fi

echo "==> [2/4] 创建站点目录 ${WEBROOT}"
mkdir -p "${WEBROOT}"

echo "==> [3/4] 写入 nginx 配置 /etc/nginx/sites-available/easy2sound-mirror"
cat > /etc/nginx/sites-available/easy2sound-mirror <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${WEBROOT};
    index index.html;
    try_files \$uri \$uri/ /index.html;

    # 静态资源缓存：图片/安装包可长缓存；js/css 不缓存（避免更新后浏览器还在用旧代码）
    location ~* \\.(jpg|jpeg|png|bmp|svg|ico|exe|zip)\$ {
        expires 7d;
        add_header Cache-Control "public";
    }
    location ~* \\.(js|css)\$ {
        add_header Cache-Control "no-cache";
    }

    # 反代 API 到主站（保持 /api 前缀，由主站 nginx 再剥离）
    location /api/ {
        proxy_pass ${UPSTREAM};
        proxy_set_header Host ${MAIN_HOST};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # 反代头像目录到主站
    location /uploads/ {
        proxy_pass ${UPSTREAM};
        proxy_set_header Host ${MAIN_HOST};
    }
}
EOF

ln -sf /etc/nginx/sites-available/easy2sound-mirror /etc/nginx/sites-enabled/easy2sound-mirror

echo "==> [4/4] 校验配置并重载 nginx"
nginx -t
systemctl reload nginx

echo ""
echo "============================================================"
echo "✅ 镜像站 nginx 配置完成"
echo ""
echo "   现在检查前端文件是否已就位："
echo "   ls ${WEBROOT}/index.html ${WEBROOT}/pages  （应存在）"
echo ""
echo "   验证命令："
echo "   curl -I http://${DOMAIN}/            # 应返回 200 HTML"
echo "   curl http://${DOMAIN}/api/           # 应返回主站健康检查 JSON"
echo "   curl -I http://${DOMAIN}/WIN/resampler.zip  # 应返回 200"
echo ""
echo "   HTTPS（可选，DNS 生效后）："
echo "   sudo apt install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d ${DOMAIN}"
echo "============================================================"

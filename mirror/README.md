# Easy2Sound 日本镜像站（方案 A）部署指南

> 方案 A = 镜像站只部署**前端**，API / 头像通过 Nginx 反代到主站。数据完全共享（账号、反馈、封禁都是同一份），页面加载和下载走日本节点，快。

## 架构

```
日本用户 → mirror.easy2sound.xyz (日本 VPS)
              ├── /           静态前端（index.html + pages/ + 图片 + WIN/）
              ├── /api/*      → 反代 → 主站 www.easy2sound.xyz/api/*
              └── /uploads/*  → 反代 → 主站（头像）
```

## 部署步骤

### 1. 准备日本服务器

- 买一台日本 VPS（Vultr 东京 / AWS 东京 / 樱花等），Ubuntu 22/24 即可，最低配够用
- 在域名 DNS 控制台加一条 **A 记录**：`mirror` → 日本服务器 IP（等几分钟生效）

### 2. 打包并上传前端（在你本地电脑，项目根目录执行）

```bash
# 打包（不含 233MB 的 resampler.zip，单独传）
tar -czf mirror-frontend.tar.gz index.html index.js style.css voicebanks.json pages background_board.jpg 图标.jpg wechatpay.jpg teto.bmp 404.html feedback2.html

# 上传
scp mirror-frontend.tar.gz mirror/setup-mirror.sh root@日本服务器IP:/
```

### 3. 在日本服务器上解压 + 一键部署

```bash
ssh root@日本服务器IP

# 解压前端
mkdir -p /var/www/easy2sound
tar -xzf /mirror-frontend.tar.gz -C /var/www/easy2sound

# 先改 setup-mirror.sh 顶部的 DOMAIN / UPSTREAM（如域名不同）
nano /setup-mirror.sh

# 一键配置 nginx
chmod +x /setup-mirror.sh
./setup-mirror.sh
```

### 4. 单独上传大文件（合成器）

```bash
# 本地执行
scp WIN/resampler.zip WIN/Easy2Sound下载引导包.exe root@日本服务器IP:/var/www/easy2sound/WIN/
```

### 5. 验证

```bash
curl -I http://mirror.easy2sound.xyz/                     # 200 HTML
curl http://mirror.easy2sound.xyz/api/                    # 主站健康检查 JSON
curl -I http://mirror.easy2sound.xyz/WIN/resampler.zip    # 200，Content-Length 约 233MB
```

### 6. HTTPS（强烈建议）

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d mirror.easy2sound.xyz
```

## 文件清单（镜像站需要的完整文件）

```
index.html  index.js  style.css  voicebanks.json
pages/           # 9 个页面文件（必须整个文件夹）
background_board.jpg  图标.jpg  wechatpay.jpg  teto.bmp
404.html  feedback2.html
WIN/Easy2Sound下载引导包.exe  WIN/resampler.zip
```

> `api/` 整个目录**不需要**部署到镜像站（接口走反代）。

## 已知注意事项

1. **反代主站必须用 `https://`**：主站对 http 请求会返回 301 跳转到 https，而 nginx 反代不会自动跟随跳转，会把 301 甩给浏览器导致跨域"网络错误"。所以 `setup-mirror.sh` 和 `nginx-mirror.conf` 里的 `UPSTREAM` / `proxy_pass` 默认都是 `https://www.easy2sound.xyz`，不要改回 http。
2. **登录限流是共享的**：主站后端从 nginx 反代进来的请求，`req.ip` 都是 `127.0.0.1`（或镜像站 IP），所以主站和镜像站的"连续 5 次失败锁定"是**共用同一个计数**。想按真实用户 IP 限流的话，需要在主站 `server.js` 开启 `app.set('trust proxy', 1)` 并让主站 nginx 转发 `X-Forwarded-For`（需要改主站，找我）。
3. **头像 URL 指向主站**：数据库里存的头像地址是 `http://www.easy2sound.xyz/uploads/...`，镜像站上会直接从主站加载，正常。镜像站的 `/uploads/` 反代是兜底。
4. **数据单向**：这是方案 A（共用主站数据），镜像站没有自己的数据库，主站挂了大后端跟着挂（页面还能打开）。
4. **更新镜像站**：主站前端有改动时，重新打包上传即可：
   ```bash
   tar -czf mirror-frontend.tar.gz index.html index.js style.css voicebanks.json pages background_board.jpg 图标.jpg wechatpay.jpg teto.bmp 404.html feedback2.html
   scp mirror-frontend.tar.gz root@日本服务器IP:/
   ssh root@日本服务器IP "tar -xzf /mirror-frontend.tar.gz -C /var/www/easy2sound"
   ```

## 升级成独立镜像（方案 B，可选）

如果以后想让镜像站在主站宕机时也能全功能运转，就在镜像站上再部署 `api/`（独立数据库），并加 crontab 定时从主站 `rsync` 数据库和 uploads。需要时找我配。

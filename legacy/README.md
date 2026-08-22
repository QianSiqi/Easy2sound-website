# legacy/ — 废弃文件

> 这些文件已被整合进根目录的 `index.html`（单文件 SPA），不再被引用。保留在这里以防万一，确认无用后可整文件夹删除。

## 内容说明

| 文件 | 说明 |
|------|------|
| `index.js` | 旧版 SPA 的脚本（页面模板 + 路由），逻辑已并入 `index.html` |
| `loginRegister.js` | 旧版多页共用的登录/注册脚本，逻辑已并入 `index.html` |
| `download.html` | 旧版下载页 |
| `voicebank.html` | 旧版声库页（原请求 `voicebank.json`，文件名 bug） |
| `feedback.html` | 旧版反馈页（原脚本引用未定义的 `JSONBIN_*` 常量） |
| `team.html` | 旧版制作组名单页 |
| `donation.html` | 旧版投喂页 |
| `source.html` | 旧版源代码页 |
| `avatar.html` | 头像上传测试页（指向 Cloudflare Worker） |
| `index.html.bak` / `.bak2` / `.bak3` | 更早版本 index.html 的备份 |
| `serve.py.bak` | serve.py 的备份 |
| `server.js.bak` | API 服务端的备份 |

> 注意：这些页面里的相对链接（如 `style.css`、`图标.jpg`、互相跳转）按原相对路径解析，移入本文件夹后不一定还能正常打开，仅供存档参考。

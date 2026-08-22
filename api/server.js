require("dotenv").config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || `http://${HOST}:8080`;

// ========== 数据库（SQLite） ==========
// 数据库路径可用环境变量 DB_PATH 指定（绝对路径或相对 api/ 目录的相对路径），默认 api/data.db
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
const resolvedDbPath = path.isAbsolute(dbPath) ? dbPath : path.join(__dirname, dbPath);
const dbDir = path.dirname(resolvedDbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(resolvedDbPath);

// 建表
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        uid INTEGER UNIQUE,            -- 短数字 UID（10000 起递增，展示用）
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        qq TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        role TEXT DEFAULT 'user',      -- user / admin
        status TEXT DEFAULT 'active',  -- active / banned
        createdAt TEXT NOT NULL
    )
`);

// 迁移：老库补充 role / status 列（ALTER TABLE 无法在 IF NOT EXISTS 里做）
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!userCols.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    console.log('[迁移] users 表新增 role 列');
}
if (!userCols.includes('status')) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
    console.log('[迁移] users 表新增 status 列');
}
if (!userCols.includes('uid')) {
    db.exec("ALTER TABLE users ADD COLUMN uid INTEGER");
    // 为已有用户回填 UID：按注册时间顺序分配 10000 起
    const existing = db.prepare('SELECT id FROM users ORDER BY createdAt, id').all();
    const setUid = db.prepare('UPDATE users SET uid = ? WHERE id = ?');
    existing.forEach((u, i) => setUid.run(10000 + i, u.id));
    console.log(`[迁移] users 表新增 uid 列，已为 ${existing.length} 个用户分配 UID`);
}

// 反馈表（替代 JSONBin，自建存储）
db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,      -- 14 位显示时间 YYYYMMDDHHmmss
        content TEXT NOT NULL,
        userAgent TEXT DEFAULT '',
        userId TEXT DEFAULT '',       -- 提交者用户 ID（未登录为空，显示匿名）
        createdAt TEXT NOT NULL
    )
`);

// 迁移：老反馈表补充 userId 列
const fbCols = db.prepare("PRAGMA table_info(feedbacks)").all().map(c => c.name);
if (!fbCols.includes('userId')) {
    db.exec("ALTER TABLE feedbacks ADD COLUMN userId TEXT DEFAULT ''");
    console.log('[迁移] feedbacks 表新增 userId 列');
}

// 预编译 SQL
const stmts = {
    insertUser: db.prepare('INSERT INTO users (id, uid, username, email, passwordHash, qq, avatar, role, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    findByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
    findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    findById: db.prepare('SELECT * FROM users WHERE id = ?'),
    updateUser: db.prepare('UPDATE users SET qq = ?, avatar = ? WHERE id = ?'),
    updatePassword: db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE users SET status = ? WHERE id = ?'),
    listUsers: db.prepare('SELECT id, uid, username, email, qq, avatar, role, status, createdAt FROM users ORDER BY createdAt DESC'),
    insertFeedback: db.prepare('INSERT INTO feedbacks (timestamp, content, userAgent, userId, createdAt) VALUES (?, ?, ?, ?, ?)'),
    listFeedbacks: db.prepare(`
        SELECT f.id, f.timestamp, f.content, f.userAgent, f.userId, f.createdAt,
               u.username AS username, u.avatar AS userAvatar, u.uid AS userUid
        FROM feedbacks f LEFT JOIN users u ON u.id = f.userId
        ORDER BY f.id DESC
    `),
    deleteFeedback: db.prepare('DELETE FROM feedbacks WHERE id = ?'),
};

// ========== 管理员配置 ==========
// 环境变量 ADMIN_USERNAMES：逗号分隔的用户名，登录时自动提升为管理员
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim()).filter(Boolean);

function isAdmin(userId) {
    if (!userId) return false;
    const u = stmts.findById.get(userId);
    return !!u && u.role === 'admin';
}

// ========== 邮箱验证码（注册用，SMTP 发信） ==========
// .env 配置：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS（QQ 邮箱用授权码）
// SMTP_DEBUG=1 仅用于开发调试：不真发信，把验证码放在响应里（切勿用于生产！）
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_DEBUG = process.env.SMTP_DEBUG === '1';

// ========== Cloudflare Turnstile 人机验证（登录用） ==========
// .env 配置 TURNSTILE_SECRET_KEY（服务器端密钥，兼容命名 TURNSTILE_SECRET）；未配置时自动跳过（开发模式）
// 可选 TURNSTILE_HOSTNAMES=域名1,域名2 主机名白名单（生产建议配置，且不要包含 localhost）
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET || '';
const TURNSTILE_HOSTNAMES = (process.env.TURNSTILE_HOSTNAMES || '').split(',').map(s => s.trim()).filter(Boolean);
const TURNSTILE_ACTION = 'login'; // 与前端 widget 的 action 一致

// 校验 Turnstile 令牌；未配置密钥时返回 skipped（不拦截）
async function verifyTurnstile(token, ip) {
    if (!TURNSTILE_SECRET_KEY) return { ok: true, skipped: true };
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
        return { ok: false, error: '请完成人机验证' };
    }
    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(10000),
            body: new URLSearchParams({
                secret: TURNSTILE_SECRET_KEY,
                response: token,
                remoteip: ip,
            }),
        });
        if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`);
        const data = await res.json();
        if (!data.success) return { ok: false, error: '人机验证失败，请重试' };
        if (data.action && data.action !== TURNSTILE_ACTION) {
            return { ok: false, error: '人机验证失败，请重试' };
        }
        if (TURNSTILE_HOSTNAMES.length > 0 && !TURNSTILE_HOSTNAMES.includes(data.hostname)) {
            return { ok: false, error: '人机验证失败，请重试' };
        }
        return { ok: true };
    } catch (e) {
        console.error('[验证码] Turnstile 验证请求失败:', e.message);
        return { ok: false, error: '人机验证服务异常，请稍后再试' };
    }
}

const mailCodes = {}; // email -> { code, expiresAt, attempts, lastSentAt }
const CODE_TTL_MS = 10 * 60 * 1000;       // 验证码有效期 10 分钟
const CODE_COOLDOWN_MS = 60 * 1000;       // 同一邮箱发送冷却 60 秒
const CODE_MAX_ATTEMPTS = 5;              // 最多错 5 次，超了作废

function genCode() {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6 位数字
}

// 发送邮件（懒加载 nodemailer，仅在有配置时使用）
async function sendMail(to, subject, html) {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        throw new Error('服务器未配置邮箱服务（SMTP_HOST/SMTP_USER/SMTP_PASS）');
    }
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({ from: `"Easy2Sound" <${SMTP_FROM}>`, to, subject, html });
}

// 校验验证码：成功返回 { ok:true }，失败返回错误信息（会清理过期/超限记录）
function verifyMailCode(email, code) {
    const entry = mailCodes[email];
    if (!entry) return { ok: false, error: '请先获取验证码' };
    if (Date.now() > entry.expiresAt) {
        delete mailCodes[email];
        return { ok: false, error: '验证码已过期，请重新获取' };
    }
    if (String(code).trim() !== entry.code) {
        entry.attempts++;
        if (entry.attempts >= CODE_MAX_ATTEMPTS) {
            delete mailCodes[email];
            return { ok: false, error: '验证码错误次数过多，请重新获取' };
        }
        return { ok: false, error: '验证码错误' };
    }
    delete mailCodes[email];
    return { ok: true };
}

// ========== 中间件 ==========
// CORS 白名单：配置的前端域名 + 本地开发地址（localhost 调试 API）+ 'null'（file:// 直接双击打开页面时浏览器带的 Origin）
app.use(cors({ origin: [FRONTEND_ORIGIN, `http://${HOST}:3000`, `http://${HOST}:8080`, 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:3000', 'null'] }));
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// 发送验证码（需在 express.json 之后注册）
app.post('/send-code', async (req, res) => {
    const { email } = req.body;
    if (!validateEmail(email)) return res.json({ ok: false, error: '请输入有效的邮箱地址' });
    if (stmts.findByEmail.get(email)) return res.json({ ok: false, error: '该邮箱已注册' });

    const now = Date.now();
    const prev = mailCodes[email];
    if (prev && now - prev.lastSentAt < CODE_COOLDOWN_MS) {
        return res.json({ ok: false, error: '发送过于频繁，请 60 秒后再试' });
    }

    const code = genCode();
    mailCodes[email] = { code, expiresAt: now + CODE_TTL_MS, attempts: 0, lastSentAt: now };

    // 调试模式：不真发信，验证码放进响应（仅开发用）
    if (SMTP_DEBUG) {
        console.log(`[验证码][调试] ${email} -> ${code}`);
        return res.json({ ok: true, debugCode: code });
    }

    try {
        await sendMail(email, '【Easy2Sound】邮箱验证码',
            `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px;">
                <h2 style="color:#7c3aed;margin:0 0 12px;">Easy2Sound 注册验证</h2>
                <p>你的验证码是：</p>
                <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#7c3aed;margin:12px 0;">${code}</p>
                <p>验证码 <b>10 分钟</b> 内有效，请勿泄露给他人。</p>
                <p style="color:#999;font-size:12px;">如果不是你本人操作，请忽略本邮件。</p>
            </div>`);
        console.log(`[验证码] 已发送至 ${email}`);
        res.json({ ok: true });
    } catch (e) {
        console.error(`[验证码] 发送失败 ${email}:`, e.message);
        res.json({ ok: false, error: '验证码发送失败，请稍后再试' });
    }
});

// ========== 工具函数 ==========
function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function genId() {
    return 'u_' + crypto.randomBytes(8).toString('hex');
}

// 分配短数字 UID（10000 起递增，单进程同步写入，MAX+1 安全）
function nextUid() {
    return db.prepare('SELECT COALESCE(MAX(uid), 9999) + 1 AS n FROM users').get().n;
}

function sanitize(str) {
    return String(str || '').replace(/[<>"']/g, '');
}

function safeUser(row) {
    if (!row) return null;
    const { passwordHash, ...rest } = row;
    return rest;
}

// ========== 输入校验 ==========
function validateUsername(u) {
    return typeof u === 'string' && u.length >= 2 && u.length <= 20;
}

function validateEmail(e) {
    return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function validatePassword(p) {
    if (typeof p !== 'string' || p.length === 0) return false;
    return true; // Accept both plaintext and pre-hashed passwords
}

// ========== 密码哈希（加盐 SHA-256） ==========
// 存储格式: salt$hash
//   salt: 32 位 hex（16 字节随机盐）
//   hash: sha256(salt + password) 的 64 位 hex
// 旧格式（无盐 SHA-256，64 位 hex）在登录时自动校验并升级为加盐格式

function genSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
    return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function isSaltedHash(s) {
    if (typeof s !== 'string' || !s.includes('$')) return false;
    const [salt, hash] = s.split('$');
    return /^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{64}$/.test(hash);
}

// 校验密码：支持新格式（salt$hash）与旧格式（无盐 64 位 hex）
// 新格式同时接受两种输入路径，兼容 https（客户端已 SHA-256）与 http（明文）环境：
//   - 明文路径:  hash = sha256(salt + 明文)
//   - 已哈希路径: hash = sha256(salt + sha256(明文))
function verifyPassword(password, stored) {
    if (isSaltedHash(stored)) {
        const [salt, hash] = stored.split('$');
        if (hash === hashPassword(password, salt)) return true;
        if (hash === hashPassword(sha256(password), salt)) return true;
        return false;
    }
    if (/^[a-f0-9]{64}$/.test(stored)) {
        return stored === sha256(password) || stored === password; // 旧格式兼容
    }
    return false;
}

function makeSaltedHash(password) {
    const salt = genSalt();
    return salt + '$' + hashPassword(password, salt);
}

// ========== 登录限流 ==========
const loginAttempts = {};
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = loginAttempts[ip];
    if (!entry) return true;
    if (now - entry.lastAttempt > LOCKOUT_MS) {
        delete loginAttempts[ip];
        return true;
    }
    return entry.count < MAX_ATTEMPTS;
}

function recordAttempt(ip) {
    const now = Date.now();
    if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: now };
    loginAttempts[ip].count++;
    loginAttempts[ip].lastAttempt = now;
}

function clearAttempts(ip) {
    delete loginAttempts[ip];
}

// ========== 文件上传 ==========
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png'].includes(file.mimetype)) cb(null, true);
        else cb(new Error('仅支持 jpg/png 格式'));
    }
});

app.use('/uploads', express.static(uploadsDir));

// ========== API 路由 ==========

// 注册（需邮箱验证码）
app.post('/register', (req, res) => {
    const { username, email, password, qq, code } = req.body;

    if (!validateUsername(username)) return res.json({ ok: false, error: '用户名需 2-20 个字符' });
    if (!validateEmail(email)) return res.json({ ok: false, error: '请输入有效的邮箱地址' });
    if (!validatePassword(password)) return res.json({ ok: false, error: '密码格式错误' });
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
        return res.json({ ok: false, error: '请输入 6 位邮箱验证码' });
    }

    if (stmts.findByUsername.get(username)) {
        return res.json({ ok: false, error: '用户名已存在' });
    }
    if (stmts.findByEmail.get(email)) {
        return res.json({ ok: false, error: '邮箱已被注册' });
    }

    // 校验邮箱验证码
    const codeCheck = verifyMailCode(email, code.trim());
    if (!codeCheck.ok) return res.json({ ok: false, error: codeCheck.error });

    const id = genId();
    const uid = nextUid();
    const avatar = qq ? `https://q.qlogo.cn/g?b=qq&nk=${qq}&s=160` : '';
    const createdAt = new Date().toISOString();

    stmts.insertUser.run(id, uid, sanitize(username), sanitize(email), makeSaltedHash(password), sanitize(qq || ''), sanitize(avatar), 'user', 'active', createdAt);

    console.log(`[注册] ${username} (UID ${uid})`);
    res.json({ ok: true });
});

// 登录
app.post('/login', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;

    if (!checkRateLimit(ip)) {
        return res.json({ ok: false, error: '登录尝试过多，请 1 分钟后再试' });
    }

    const { username, password, captchaToken } = req.body;
    if (!username || !password) {
        return res.json({ ok: false, error: '请输入用户名和密码' });
    }

    // 人机验证（配置了 Turnstile 密钥才启用）
    const captchaCheck = await verifyTurnstile(captchaToken, ip);
    if (!captchaCheck.ok) {
        return res.json({ ok: false, error: captchaCheck.error });
    }

    const user = stmts.findByUsername.get(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
        recordAttempt(ip);
        return res.json({ ok: false, error: '用户名或密码错误' });
    }

    // 旧格式（无盐 SHA-256）登录成功后自动升级为加盐格式
    if (!isSaltedHash(user.passwordHash)) {
        stmts.updatePassword.run(makeSaltedHash(password), user.id);
        console.log(`[升级] ${user.username} 密码已升级为加盐哈希`);
    }

    // 封禁检查
    if (user.status === 'banned') {
        return res.json({ ok: false, error: '该账号已被封禁，请联系管理员' });
    }

    // 管理员自动提升（env ADMIN_USERNAMES 中的用户名）
    if (ADMIN_USERNAMES.includes(user.username) && user.role !== 'admin') {
        stmts.setRole.run('admin', user.id);
        user.role = 'admin';
        console.log(`[管理员] ${user.username} 已提升为管理员`);
    }

    clearAttempts(ip);
    console.log(`[登录] ${user.username} (${user.id}) role=${user.role}`);
    res.json({ ok: true, user: safeUser(user) });
});

// 更新用户信息
app.post('/update-user-info', (req, res) => {
    const { userId, qq, avatar } = req.body;
    if (!userId) return res.json({ ok: false, error: '缺少用户 ID' });

    const user = stmts.findById.get(userId);
    if (!user) return res.json({ ok: false, error: '用户不存在' });

    const newQq = qq !== undefined ? sanitize(qq) : user.qq;
    const newAvatar = avatar !== undefined ? sanitize(avatar) : user.avatar;

    stmts.updateUser.run(newQq, newAvatar, userId);

    const updated = stmts.findById.get(userId);
    console.log(`[更新] ${updated.username} (${updated.id})`);
    res.json({ ok: true, user: safeUser(updated) });
});

// 头像上传
app.post('/', upload.single('avatar'), (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, message: '未收到文件' });
        // 使用请求的 Host 生成 URL，兼容本地（localhost:3000）与 Nginx 反代（域名）场景
        const url = `http://${req.get('host')}/uploads/${req.file.filename}`;
        console.log(`[上传] ${req.file.filename} (${req.file.size} bytes)`);
        res.json({ success: true, url });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// 错误处理
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.json({ success: false, message: `上传错误: ${err.message}` });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: '服务器内部错误' });
});

// ========== 反馈接口（自建存储，替代 JSONBin） ==========

// 获取反馈列表（按时间倒序，最新的在前）
app.get('/feedback', (req, res) => {
    res.json({ ok: true, feedbacks: stmts.listFeedbacks.all() });
});

// 提交反馈
app.post('/feedback', (req, res) => {
    const { content, userAgent, userId } = req.body;
    if (typeof content !== 'string' || !content.trim()) {
        return res.json({ ok: false, error: '反馈内容不能为空' });
    }
    if (content.length > 500) {
        return res.json({ ok: false, error: '反馈内容不能超过 500 字' });
    }

    // 记录提交者（可选）：校验 userId 对应账号存在且未被封禁
    let uid = '';
    if (userId) {
        const u = stmts.findById.get(userId);
        if (u && u.status !== 'banned') uid = u.id;
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    stmts.insertFeedback.run(ts, content.trim(), typeof userAgent === 'string' ? userAgent.slice(0, 300) : '', uid, now.toISOString());
    console.log(`[反馈] ${ts} ${uid || '(匿名)'} ${content.trim().slice(0, 30)}...`);
    res.json({ ok: true });
});

// 用户基础信息（公开，不含邮箱，保护隐私）
app.get('/user/:id', (req, res) => {
    const user = stmts.findById.get(req.params.id);
    if (!user) return res.json({ ok: false, error: '用户不存在' });
    const { passwordHash, email, ...rest } = user;
    res.json({ ok: true, user: rest });
});

// ========== 管理员接口（需 userId 且 role=admin） ==========

// 删除反馈（仅管理员）
app.delete('/feedback/:id', (req, res) => {
    const { userId } = req.query;
    if (!isAdmin(userId)) return res.json({ ok: false, error: '无权限，仅管理员可操作' });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.json({ ok: false, error: '无效的反馈 ID' });

    const info = stmts.deleteFeedback.run(id);
    if (info.changes === 0) return res.json({ ok: false, error: '反馈不存在' });
    console.log(`[管理] 删除反馈 #${id}`);
    res.json({ ok: true });
});

// 用户列表（仅管理员）
app.get('/admin/users', (req, res) => {
    const { userId } = req.query;
    if (!isAdmin(userId)) return res.json({ ok: false, error: '无权限，仅管理员可操作' });

    res.json({ ok: true, users: stmts.listUsers.all() });
});

// 封禁 / 解封用户（仅管理员）
app.post('/admin/users/:id/status', (req, res) => {
    const { userId, status } = req.body;
    if (!isAdmin(userId)) return res.json({ ok: false, error: '无权限，仅管理员可操作' });

    const target = stmts.findById.get(req.params.id);
    if (!target) return res.json({ ok: false, error: '用户不存在' });

    if (target.id === userId) return res.json({ ok: false, error: '不能封禁/解封自己' });
    if (status !== 'active' && status !== 'banned') return res.json({ ok: false, error: '状态必须是 active 或 banned' });

    stmts.setStatus.run(status, target.id);
    console.log(`[管理] ${target.username} 状态 -> ${status}`);
    res.json({ ok: true });
});

// 健康检查
app.get('/', (req, res) => {
    res.json({ status: 'ok', name: 'Easy2Sound API', version: '1.0.0', db: 'SQLite' });
});

// ========== 启动 ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Easy2Sound API 已启动: http://${HOST}:${PORT}`);
    console.log(`📁 数据库: ${resolvedDbPath}`);
    console.log(`🌐 前端域名: ${FRONTEND_ORIGIN}\n`);
});

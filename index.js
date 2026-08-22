// ==========================================================================
// Easy2Sound - Ethereal Spatial Background Animation Engine & App Controller
// ==========================================================================

// ========== API 与环境配置 ==========
const _isLocal = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
const API_BASE = _isLocal ? 'http://localhost:3000' : '/api';
const AVATAR_UPLOAD_API = API_BASE;
const USER_KEY = 'easy2sound_user_info';
const DEFAULT_AVATAR = 'https://q1.qlogo.cn/g?b=qq&nk=0&s=160';

// Cloudflare Turnstile 人机验证
const TURNSTILE_SITE_KEY = '0x4AAAAAAEVB20WwYGeb5NZr';
let captchaToken = '';

// ========== 数据状态 ==========
let voicebanks = [];
let currentVBFilter = 'all';
let currentPage = 'home';
const PAGE_CACHE = {};

// ========== 矢量图标库 ==========
const ICONS = {
    check: `<svg class="icon-svg" viewBox="0 0 24 24" style="color:var(--success);"><polyline points="20 6 9 17 4 12"/></svg>`,
    error: `<svg class="icon-svg" viewBox="0 0 24 24" style="color:var(--danger);"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg class="icon-svg" viewBox="0 0 24 24" style="color:var(--astral-cyan);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    play: `<svg class="icon-svg" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    crown: `<svg class="icon-svg" viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z"/></svg>`,
    user: `<svg class="icon-svg" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    trash: `<svg class="icon-svg" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    arrowRight: `<svg class="icon-svg" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    lock: `<svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    unlock: `<svg class="icon-svg" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
};

// ========== Toast 通知系统 ==========
function showToast(text, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span style="display:flex;align-items:center;">${ICONS[type] || ICONS.info}</span><span>${escapeHtml(text)}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// ========== 工具函数 ==========
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function showMsg(id, text, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'message ' + (ok ? 'success' : 'error');
    setTimeout(() => el.className = 'message', 3500);
}

async function hashPassword(p) {
    try {
        if (window.crypto && crypto.subtle && crypto.subtle.digest) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
    } catch (e) { /* 降级 */ }
    return p;
}

function formatDateTime(ts) {
    if (typeof ts === 'object' && ts instanceof Date) {
        const pad = n => String(n).padStart(2, '0');
        return `${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
    }
    if (typeof ts === 'string' && ts.length === 14) {
        return `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)} ${ts.slice(8,10)}:${ts.slice(10,12)}`;
    }
    if (typeof ts === 'string' && ts.includes('T')) {
        const d = new Date(ts);
        if (!isNaN(d)) return formatDateTime(d);
    }
    return ts || '-';
}

function isCurrentUserAdmin() {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return !!user && user.role === 'admin';
}

// ========== 打字机动效引擎 (Typewriter Engine) ==========
let typewriterTimer = null;

function initTypewriter() {
    if (typewriterTimer) clearTimeout(typewriterTimer);
    const target = document.getElementById('typewriterText');
    if (!target) return;

    const phrases = [
        '让声音，自由发声。',
        '让灵感，即刻唱响。',
        '让每一次呼吸，都成为旋律。'
    ];

    let phraseIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function type() {
        if (!document.getElementById('typewriterText')) return;

        const curPhrase = phrases[phraseIdx];
        
        if (isDeleting) {
            target.textContent = curPhrase.substring(0, charIdx - 1);
            charIdx--;
        } else {
            target.textContent = curPhrase.substring(0, charIdx + 1);
            charIdx++;
        }

        let speed = isDeleting ? 40 : 85;

        if (!isDeleting && charIdx === curPhrase.length) {
            speed = 2400;
            isDeleting = true;
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false;
            phraseIdx = (phraseIdx + 1) % phrases.length;
            speed = 400;
        }

        typewriterTimer = setTimeout(type, speed);
    }

    target.textContent = '';
    type();
}

// ========== 简约双层流体光标 ==========
let sparks = [];

function initKineticCursor() {
    const dot = document.getElementById('cursorDot');
    const ring = document.getElementById('cursorRing');
    if (!dot || !ring) return;

    let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let ringPos = { x: mouse.x, y: mouse.y };
    let lastPos = { x: mouse.x, y: mouse.y };

    window.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;

        dot.style.transform = `translate3d(${mouse.x}px, ${mouse.y}px, 0) translate(-50%, -50%)`;

        const dist = Math.hypot(mouse.x - lastPos.x, mouse.y - lastPos.y);
        if (dist > 10 && sparks.length < 24) {
            sparks.push({
                x: mouse.x,
                y: mouse.y,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                alpha: 0.8,
                size: Math.random() * 2.5 + 1,
                color: Math.random() > 0.5 ? '#38bdf8' : '#818cf8'
            });
        }
        lastPos.x = mouse.x;
        lastPos.y = mouse.y;

        const target = e.target.closest('a, button, input, select, .vb-card, .borderless-feature-item, .stat-box, .team-fluid-col, .download-fluid-col, .spatial-col');
        if (target) {
            ring.classList.add('cursor-hover');
            dot.classList.add('cursor-hover');
        } else {
            ring.classList.remove('cursor-hover');
            dot.classList.remove('cursor-hover');
        }
    });

    window.addEventListener('mousedown', () => ring.classList.add('cursor-down'));
    window.addEventListener('mouseup', () => ring.classList.remove('cursor-down'));

    function renderCursor() {
        ringPos.x += (mouse.x - ringPos.x) * 0.18;
        ringPos.y += (mouse.y - ringPos.y) * 0.18;

        ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%)`;

        requestAnimationFrame(renderCursor);
    }
    renderCursor();
}

// ========== 🌌 空灵星空与全息声波粒子 Canvas 动效引擎 ==========
let waveResonance = 1.0;
let ripples = [];

function pulseCyberWaves() {
    waveResonance = 2.4;
    setTimeout(() => { waveResonance = 1.0; }, 600);
}

function initCyberWaves() {
    const canvas = document.getElementById('cyberWaveCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initParticles();
    });

    let mouse = { x: width / 2, y: height / 2, targetY: height / 2, isMoving: false };
    let moveTimeout;

    window.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.targetY = e.clientY;
        mouse.isMoving = true;
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => { mouse.isMoving = false; }, 200);

        // 随机产生微小声波涟漪
        if (Math.random() < 0.08 && ripples.length < 8) {
            ripples.push({
                x: e.clientX,
                y: e.clientY,
                radius: 5,
                maxRadius: Math.random() * 80 + 50,
                alpha: 0.5,
                color: Math.random() > 0.5 ? 'rgba(56, 189, 248,' : 'rgba(129, 140, 248,'
            });
        }
    });

    window.addEventListener('click', e => {
        ripples.push({
            x: e.clientX,
            y: e.clientY,
            radius: 5,
            maxRadius: 180,
            alpha: 0.8,
            color: 'rgba(56, 189, 248,'
        });
    });

    // 空间浮游声学星尘粒子网络
    let particles = [];
    const PARTICLE_COUNT = Math.min(Math.floor(window.innerWidth / 18), 75);

    function initParticles() {
        particles = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.45,
                vy: (Math.random() - 0.5) * 0.45,
                radius: Math.random() * 2.2 + 0.8,
                baseAlpha: Math.random() * 0.45 + 0.15,
                pulse: Math.random() * Math.PI,
                color: Math.random() > 0.6 ? '#38bdf8' : (Math.random() > 0.3 ? '#818cf8' : '#ffffff')
            });
        }
    }
    initParticles();

    // 绚丽流动声波曲线
    let phase = 0;
    const waves = [
        { freq: 0.0025, amp: 65, speed: 0.018, color: 'rgba(56, 189, 248, 0.35)', fill: 'rgba(56, 189, 248, 0.04)', blur: 12 },
        { freq: 0.0035, amp: 85, speed: 0.014, color: 'rgba(129, 140, 248, 0.40)', fill: 'rgba(129, 140, 248, 0.05)', blur: 14 },
        { freq: 0.0018, amp: 70, speed: 0.022, color: 'rgba(255, 255, 255, 0.22)', fill: 'transparent', blur: 10 }
    ];

    function draw() {
        ctx.clearRect(0, 0, width, height);

        mouse.y += (mouse.targetY - mouse.y) * 0.06;
        const centerY = height * 0.5 + (mouse.y - height * 0.5) * 0.18;

        phase += 0.022;

        // 1. 渲染背景极光声波带 (Luminous Fluid Waves with Gradient Fill)
        waves.forEach((w, idx) => {
            ctx.beginPath();
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = w.color;
            ctx.shadowBlur = w.blur;
            ctx.shadowColor = w.color;

            let firstY = 0;
            for (let x = 0; x <= width; x += 10) {
                const curAmp = w.amp * waveResonance;
                const y = centerY + 
                    Math.sin(x * w.freq + phase * (idx + 1) * w.speed) * curAmp * (1 + Math.sin(x * 0.0012)) +
                    Math.cos(x * 0.0025 - phase * 0.6) * (curAmp * 0.45);
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                    firstY = y;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // 渐变填充流光
            if (w.fill !== 'transparent') {
                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.closePath();
                ctx.fillStyle = w.fill;
                ctx.fill();
            }
        });

        // 2. 渲染交互声波涟漪 (Acoustic Sonar Ripples)
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.radius += 2.2;
            r.alpha *= 0.96;

            if (r.alpha <= 0.01 || r.radius >= r.maxRadius) {
                ripples.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `${r.color} ${r.alpha})`;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 8;
            ctx.shadowColor = `${r.color} 0.5)`;
            ctx.stroke();
        }

        // 3. 渲染空间浮游星尘粒子与连线 (Floating Constellation Particle Mesh)
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += 0.03;

            // 边缘环绕
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;
            if (p.y < 0) p.y = height;
            if (p.y > height) p.y = 0;

            // 鼠标微引力/排斥
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 140) {
                const angle = Math.atan2(dy, dx);
                p.x += Math.cos(angle) * 1.2;
                p.y += Math.sin(angle) * 1.2;
            }

            const currentAlpha = p.baseAlpha + Math.sin(p.pulse) * 0.2;

            // 粒子自身
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0.1, Math.min(1, currentAlpha));
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.fill();

            // 粒子间微弱能量发丝连线
            for (let j = i + 1; j < particles.length; j++) {
                const p2 = particles[j];
                const pDist = Math.hypot(p.x - p2.x, p.y - p2.y);
                if (pDist < 95) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = 'rgba(129, 140, 248, ' + (0.16 * (1 - pDist / 95)) + ')';
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        // 4. 渲染鼠标星尘微彗尾 (Stardust Cursor Trail)
        for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.032;

            if (p.alpha <= 0) {
                sparks.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        requestAnimationFrame(draw);
    }
    draw();
}

// ========== 页面拉取与电影级转场路由 ==========
const DENIED_HTML = `
    <div class="fluid-container">
        <div style="text-align:center;padding:80px 20px;">
            <h1 style="color:#fca5a5;justify-content:center;font-size:2.5rem;">403 · 访问受限</h1>
            <p style="margin:16px 0 28px;color:var(--text-secondary);">只有管理员可以访问此页面</p>
            <a href="#home" class="btn-beam">返回主页</a>
        </div>
    </div>
`;

async function fetchPageHtml(page) {
    if (PAGE_CACHE[page]) return PAGE_CACHE[page];
    try {
        const res = await fetch('pages/' + page + '.html?' + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        PAGE_CACHE[page] = html;
        return html;
    } catch (e) {
        if (page !== 'notfound') return fetchPageHtml('notfound');
        return '<div class="fluid-container"><div style="text-align:center;padding:60px 20px;"><h1>加载失败</h1><p>页面文件加载失败，请确认 pages/ 目录完整。</p></div></div>';
    }
}

function updateNav(page) {
    document.querySelectorAll('#navLinks a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });
    const nav = document.getElementById('navLinks');
    if (nav) nav.classList.remove('open');
}

async function renderPage() {
    let page = (location.hash || '#home').slice(1);
    const app = document.getElementById('app');
    const laser = document.getElementById('pageLaserBeam');
    if (!app) return;

    if (laser) {
        laser.classList.add('active');
        laser.style.width = '70%';
    }
    pulseCyberWaves();

    app.className = 'page-transitioning-out';

    setTimeout(async () => {
        currentPage = page;
        updateNav(page);
        window.scrollTo({ top: 0, behavior: 'instant' });

        let content = '';
        if (page === 'admin' && !isCurrentUserAdmin()) {
            content = DENIED_HTML;
        } else {
            content = await fetchPageHtml(page);
        }

        app.innerHTML = content;
        
        const sections = app.querySelectorAll('section, .subpage-fluid-header, .download-fluid-grid, .vb-grid, .team-fluid-grid, .fb-timeline-wrap, .marquee-space-wrap, .spatial-story-section, .cinema-space-section, .grand-cta-section');
        sections.forEach((sec, i) => {
            sec.classList.add(`stagger-in-${Math.min(i + 1, 3)}`);
        });

        app.className = 'page-transitioning-in';

        if (laser) laser.style.width = '100%';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                app.className = 'page-transitioned';
                if (laser) {
                    setTimeout(() => {
                        laser.classList.remove('active');
                        laser.style.width = '0%';
                    }, 240);
                }
            });
        });

        // 挂载特定交互
        if (page === 'home' || !page) initTypewriter();
        if (page === 'voicebank') loadVoicebanks();
        if (page === 'feedback') initFeedback();
        if (page === 'admin') initAdminPage();
    }, 160);
}

// ========== 声库加载与渲染 ==========
async function loadVoicebanks() {
    const grid = document.getElementById('vbGrid');
    if (!grid) return;
    
    const searchInput = document.getElementById('search1');
    if (searchInput) searchInput.oninput = () => searchVoicebanks();

    try {
        const res = await fetch('voicebanks.json?' + Date.now());
        voicebanks = await res.json();
        renderVBGrid();
    } catch (e) {
        grid.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.4);padding:40px;grid-column:1/-1;">声库加载失败：${escapeHtml(e.message)}</div>`;
    }
}

function renderVBGrid(list) {
    const grid = document.getElementById('vbGrid');
    if (!grid) return;
    
    let items = list || voicebanks;
    if (currentVBFilter !== 'all') {
        items = items.filter(vb => (vb.tag || '').includes(currentVBFilter));
    }

    if (!items.length) {
        grid.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:40px;grid-column:1/-1;">没有找到匹配的声库</div>';
        return;
    }

    grid.innerHTML = items.map((vb, idx) => `
        <div class="vb-card stagger-in-${(idx % 3) + 1}" data-vb="${escapeHtml(vb.id)}" onclick="openVBModal('${escapeHtml(vb.id)}')">
            <div class="vb-card-img-wrap">
                <img class="vb-card-img" src="${escapeHtml(vb.img || '图标.jpg')}" alt="${escapeHtml(vb.name)}" loading="lazy">
                <div class="vb-card-play-hint" title="试听/详情">${ICONS.play}</div>
            </div>
            <div class="vb-card-body">
                <div class="vb-card-title">${escapeHtml(vb.name)}</div>
                <div class="vb-card-desc">${escapeHtml((vb.desc || '').slice(0, 52))}...</div>
                <div class="vb-card-footer">
                    <span class="vb-tag">${escapeHtml(vb.tag || '通用')}</span>
                    <span style="font-size:12px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:4px;">详情 ${ICONS.arrowRight}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function filterVoicebanks(tag) {
    currentVBFilter = tag;
    document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.tag === tag);
    });
    searchVoicebanks();
}

function searchVoicebanks() {
    const input = document.getElementById('search1');
    const kw = (input ? input.value : '').trim().toLowerCase();
    if (!kw) { renderVBGrid(); return; }
    
    const filtered = voicebanks.filter(vb =>
        (vb.name || '').toLowerCase().includes(kw) ||
        (vb.desc || '').toLowerCase().includes(kw) ||
        (vb.tag || '').toLowerCase().includes(kw)
    );
    renderVBGrid(filtered);
}

// ========== 声库详情弹窗 ==========
function openVBModal(id) {
    const vb = voicebanks.find(v => v.id === id);
    if (!vb) return;
    
    document.getElementById('vbModalImg').src = vb.img || '图标.jpg';
    document.getElementById('vbModalTitle').textContent = vb.name;
    document.getElementById('vbModalDesc').textContent = vb.desc;
    document.getElementById('vbModalTag').textContent = vb.tag || '通用';

    const demoWrap = document.getElementById('vbDemoWrap');
    const demoPlayer = document.getElementById('vbDemoPlayer');
    if (vb.demo) {
        demoWrap.style.display = 'block';
        demoPlayer.src = vb.demo;
    } else {
        demoWrap.style.display = 'none';
        demoPlayer.src = '';
    }

    const videoWrap = document.getElementById('vbVideoWrap');
    if (vb.bvid) {
        videoWrap.style.display = 'block';
        document.getElementById('vbVideoFrame').src = `https://player.bilibili.com/player.html?bvid=${vb.bvid}&autoplay=0&high_quality=1`;
    } else {
        videoWrap.style.display = 'none';
        document.getElementById('vbVideoFrame').src = '';
    }

    document.getElementById('vbModal').classList.add('active');
}

function closeVBModal() {
    document.getElementById('vbModal').classList.remove('active');
    const demoPlayer = document.getElementById('vbDemoPlayer');
    if (demoPlayer) demoPlayer.pause();
    document.getElementById('vbVideoFrame').src = '';
}

// ========== 用户栏与状态管理 ==========
function renderUserBar() {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    const el = document.getElementById('userInfo');
    const navAdmin = document.getElementById('navAdmin');
    if (!el) return;

    if (!user) {
        el.innerHTML = `
            <a href="javascript:" class="btn-beam" id="goLogin" style="padding:6px 18px;font-size:12.5px;">
                ${ICONS.user}
                <span>登录</span>
            </a>
        `;
        document.getElementById('goLogin').onclick = () => {
            initCaptcha();
            document.getElementById('loginModal').classList.add('active');
        };
        if (navAdmin) navAdmin.style.display = 'none';
        return;
    }

    const isAdmin = user.role === 'admin';
    const avatar = user.avatar || DEFAULT_AVATAR;
    
    el.innerHTML = `
        <div class="avatar-box" id="avatarBox" title="点击设置头像">
            <img src="${escapeHtml(avatar)}" class="avatar-img" alt="用户头像" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}';">
        </div>
        <span class="username-display">
            ${escapeHtml(user.username)}
            ${isAdmin ? `<span class="admin-badge">${ICONS.crown} 管理员</span>` : ''}
        </span>
        <button class="btn-ghost-glow" id="logoutBtn" style="padding:4px 12px;font-size:12px;">退出</button>
    `;

    document.getElementById('logoutBtn').onclick = () => {
        localStorage.removeItem(USER_KEY);
        renderUserBar();
        showToast('已退出登录', 'info');
        if (currentPage === 'admin') renderPage();
    };

    if (navAdmin) navAdmin.style.display = isAdmin ? '' : 'none';
}

// ========== 邮箱验证码发送 ==========
let regCodeCountdown = 0;
async function sendRegisterCode() {
    const email = document.getElementById('reg-email').value.trim();
    const btn = document.getElementById('reg-send-code');
    if (!btn || regCodeCountdown > 0) return;
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showMsg('register-message', '请输入正确的邮箱格式', false);
    }
    
    btn.disabled = true;
    btn.textContent = '发送中...';
    
    try {
        const res = await fetch(API_BASE + '/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '发送失败');
        
        showMsg('register-message', '验证码已发送至邮箱，请查收', true);
        showToast('验证码发送成功', 'success');
        
        regCodeCountdown = 60;
        const timer = setInterval(() => {
            regCodeCountdown--;
            if (regCodeCountdown <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.textContent = '获取验证码';
            } else {
                btn.textContent = `${regCodeCountdown}s`;
            }
        }, 1000);
    } catch (e) {
        showMsg('register-message', e.message, false);
        btn.disabled = false;
        btn.textContent = '获取验证码';
    }
}

// ========== Cloudflare Turnstile ==========
let captchaInited = false;
function initCaptcha() {
    const box = document.getElementById('captchaBox');
    if (!TURNSTILE_SITE_KEY || !box || captchaInited) return;
    captchaInited = true;
    box.style.display = 'block';

    if (window.turnstile) {
        renderTurnstile(box);
    } else {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        s.onload = () => renderTurnstile(box);
        s.onerror = () => {
            box.innerHTML = '<div style="color:#fca5a5;font-size:12px;padding:6px;">人机验证加载失败</div>';
        };
        document.head.appendChild(s);
    }
}

function renderTurnstile(box) {
    box.innerHTML = '';
    window.turnstile.render(box, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        action: 'login',
        callback: (token) => { captchaToken = token; },
        'expired-callback': () => { captchaToken = ''; },
        'error-callback': () => { captchaToken = ''; },
    });
}

function resetCaptcha() {
    captchaToken = '';
    if (window.turnstile && TURNSTILE_SITE_KEY) window.turnstile.reset();
}

// ========== 登录 / 注册表单交互 ==========
function bindLoginRegister() {
    document.getElementById('login-btn').onclick = async () => {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value.trim();
        if (!u || !p) return showMsg('login-message', '请输入用户名和密码', false);
        if (TURNSTILE_SITE_KEY && !captchaToken) return showMsg('login-message', '请先完成安全验证', false);

        try {
            const password = await hashPassword(p);
            const body = { username: u, password };
            if (captchaToken) body.captchaToken = captchaToken;

            const r = await fetch(API_BASE + '/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            resetCaptcha();

            if (d.ok) {
                localStorage.setItem(USER_KEY, JSON.stringify(d.user));
                showMsg('login-message', '登录成功！', true);
                showToast(`欢迎回来，${d.user.username}`, 'success');
                setTimeout(() => {
                    document.getElementById('loginModal').classList.remove('active');
                    renderUserBar();
                    if (currentPage === 'admin') renderPage();
                }, 600);
            } else {
                showMsg('login-message', d.error || '用户名或密码错误', false);
            }
        } catch {
            resetCaptcha();
            showMsg('login-message', '网络连接异常', false);
        }
    };

    document.getElementById('register-btn').onclick = async () => {
        const u = document.getElementById('reg-username').value.trim();
        const e = document.getElementById('reg-email').value.trim();
        const q = document.getElementById('reg-qq').value.trim();
        const c = document.getElementById('reg-code').value.trim();
        const p = document.getElementById('reg-password').value.trim();

        if (!u || !e || !c || !p) return showMsg('register-message', '请完整填写注册信息', false);
        if (u.length < 2 || u.length > 20) return showMsg('register-message', '用户名需 2-20 字符', false);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return showMsg('register-message', '邮箱格式有误', false);
        if (!/^\d{6}$/.test(c)) return showMsg('register-message', '验证码应为 6 位数字', false);
        if (p.length < 6) return showMsg('register-message', '密码长度至少 6 位', false);

        try {
            const password = await hashPassword(p);
            const res = await fetch(API_BASE + '/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, email: e, password, qq: q, code: c })
            });
            const d = await res.json();
            if (d.ok) {
                showMsg('register-message', '注册成功！请切换到登录', true);
                showToast('账号创建成功', 'success');
                setTimeout(() => document.querySelectorAll('.tab')[0].click(), 1000);
            } else {
                showMsg('register-message', d.error || '注册失败', false);
            }
        } catch {
            showMsg('register-message', '网络连接错误', false);
        }
    };

    document.getElementById('saveAvatarBtn').onclick = async () => {
        const user = JSON.parse(localStorage.getItem(USER_KEY));
        if (!user) return showMsg('avatar-message', '请先登录', false);

        const qq = document.getElementById('setting-qq').value.trim();
        const avatar = document.getElementById('setting-avatar-url').value.trim();
        if (!qq && !avatar) return showMsg('avatar-message', '请至少输入 QQ 号或头像链接', false);

        try {
            const r = await fetch(API_BASE + '/update-user-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, qq, avatar })
            });
            const d = await r.json();
            if (d.ok) {
                user.qq = d.user.qq;
                user.avatar = d.user.avatar;
                localStorage.setItem(USER_KEY, JSON.stringify(user));
                showMsg('avatar-message', '保存成功', true);
                showToast('头像已更新', 'success');
                setTimeout(() => {
                    document.getElementById('avatarSettingModal').classList.remove('active');
                    renderUserBar();
                }, 600);
            } else {
                showMsg('avatar-message', d.error || '保存失败', false);
            }
        } catch {
            showMsg('avatar-message', '网络错误', false);
        }
    };
}

// ========== 头像上传与设置 ==========
function bindAvatarBoxClick() {
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('#avatarBox')) openAvatarSetting();
    });
}

function bindAvatarUpload() {
    const uploadBox = document.getElementById('uploadBox');
    const avatarFile = document.getElementById('avatarFile');
    if (!uploadBox || !avatarFile) return;

    uploadBox.addEventListener('click', () => avatarFile.click());
    avatarFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            return showMsg('avatar-message', '仅支持 JPG / PNG 格式', false);
        }
        if (file.size > 2 * 1024 * 1024) {
            return showMsg('avatar-message', '图片不能超过 2MB', false);
        }

        const fd = new FormData();
        fd.append('avatar', file);
        const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        fd.append('user_id', user ? user.id : 'default_user');

        try {
            showMsg('avatar-message', '正在上传...', true);
            const res = await fetch(AVATAR_UPLOAD_API + '/upload-avatar', {
                method: 'POST',
                body: fd,
                mode: 'cors'
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                document.getElementById('avatarPreviewImg').src = data.url;
                document.getElementById('setting-avatar-url').value = data.url;
                showMsg('avatar-message', '上传成功，请保存', true);
                showToast('上传成功', 'success');
            } else {
                showMsg('avatar-message', data.error || '上传失败', false);
            }
        } catch (err) {
            showMsg('avatar-message', '上传失败：' + err.message, false);
        }
    });
}

function openAvatarSetting() {
    const user = JSON.parse(localStorage.getItem(USER_KEY));
    if (!user) return;
    const prev = document.getElementById('avatarPreviewImg');
    const qq = document.getElementById('setting-qq');
    const url = document.getElementById('setting-avatar-url');
    
    prev.src = user.avatar || DEFAULT_AVATAR;
    qq.value = user.qq || '';
    url.value = user.avatar || '';

    qq.oninput = () => {
        if (qq.value.trim()) {
            const a = `https://q1.qlogo.cn/g?b=qq&nk=${qq.value.trim()}&s=160`;
            prev.src = a;
            url.value = a;
        }
    };
    url.oninput = () => {
        if (url.value) prev.src = url.value;
    };

    document.getElementById('avatarSettingModal').classList.add('active');
}

// ========== 弹窗控制 ==========
function bindModalEvents() {
    document.getElementById('closeModal').onclick = () => document.getElementById('loginModal').classList.remove('active');
    document.getElementById('closeAvatarModal').onclick = () => document.getElementById('avatarSettingModal').classList.remove('active');
    document.getElementById('closeUserInfoModal').onclick = () => document.getElementById('userInfoModal').classList.remove('active');

    ['loginModal', 'avatarSettingModal', 'userInfoModal', 'vbModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.onclick = (e) => {
                if (e.target === el) {
                    el.classList.remove('active');
                    if (id === 'vbModal') closeVBModal();
                }
            };
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.login-modal.active, .avatar-setting-modal.active, .vb-modal.active').forEach(m => {
                m.classList.remove('active');
            });
            closeVBModal();
        }
    });
}

function bindTabSwitch() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(t => {
        t.onclick = () => {
            tabs.forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));
            t.classList.add('active');
            document.getElementById(t.dataset.tab).classList.add('active');
            if (t.dataset.tab === 'login') initCaptcha();
        };
    });
}

function bindMobileNav() {
    const toggle = document.getElementById('mobileToggle');
    const links = document.getElementById('navLinks');
    if (toggle && links) {
        toggle.onclick = () => links.classList.toggle('open');
    }
}

// ========== 用户画像 ==========
async function showUserInfo(userId) {
    const modal = document.getElementById('userInfoModal');
    const nameEl = document.getElementById('userInfoName');
    const uidEl = document.getElementById('userInfoUid');
    const createdEl = document.getElementById('userInfoCreated');
    const qqEl = document.getElementById('userInfoQq');
    const badgeEl = document.getElementById('userInfoBadges');
    const avatarEl = document.getElementById('userInfoAvatar');

    try {
        const res = await fetch(API_BASE + '/user/' + encodeURIComponent(userId));
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '加载失败');
        
        const u = d.user;
        avatarEl.src = u.avatar || DEFAULT_AVATAR;
        nameEl.textContent = u.username || '用户';
        uidEl.textContent = u.uid || '-';
        createdEl.textContent = formatDateTime(u.createdAt);
        qqEl.textContent = u.qq || '未填写';
        
        let badges = '';
        if (u.role === 'admin') badges += `<span class="tag-admin">${ICONS.crown} 管理员</span> `;
        if (u.status === 'banned') badges += '<span class="tag-banned">已封禁</span>';
        badgeEl.innerHTML = badges;

        modal.classList.add('active');
    } catch (e) {
        showToast('获取用户信息失败: ' + e.message, 'error');
    }
}

// ========== 反馈交互 ==========
function initFeedback() {
    const btn = document.getElementById('fbSubmit');
    const input = document.getElementById('fbInput');
    if (!btn || !input) return;

    btn.onclick = submitFeedback;
    input.onkeypress = (e) => { if (e.key === 'Enter') submitFeedback(); };
    loadFeedbackList();
}

async function loadFeedbackList() {
    const container = document.getElementById('fbList');
    if (!container) return;

    try {
        const res = await fetch(API_BASE + '/feedback?' + Date.now());
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || '加载失败');
        renderFeedbackList(container, data.feedbacks || []);
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.4);padding:24px;">加载失败：${escapeHtml(e.message)}</div>`;
    }
}

function renderFeedbackList(container, items) {
    if (!items || !items.length) {
        container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:24px;">暂无反馈</div>';
        return;
    }

    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    const isAdminUser = user && user.role === 'admin';

    container.innerHTML = items.map((i, idx) => `
        <div class="fb-item stagger-in-${(idx % 3) + 1}">
            <div class="fb-header">
                ${i.userId
                    ? `<div class="fb-user" onclick="showUserInfo('${escapeHtml(i.userId)}')">
                         <img class="fb-avatar" src="${escapeHtml(i.userAvatar || DEFAULT_AVATAR)}" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}';">
                         <span class="fb-username">${escapeHtml(i.username || '用户')}${i.userUid ? `<span class="fb-uid">UID ${escapeHtml(i.userUid)}</span>` : ''}</span>
                       </div>`
                    : `<span style="font-size:12px;color:var(--text-secondary);display:inline-flex;align-items:center;gap:4px;">${ICONS.user} 匿名用户</span>`}
                <span class="fb-time">${escapeHtml(formatDateTime(i.timestamp))}</span>
            </div>
            <div class="fb-text">${escapeHtml(i.content)}</div>
            ${isAdminUser ? `<button class="fb-del" onclick="deleteFeedback(${i.id})">${ICONS.trash} 删除</button>` : ''}
        </div>
    `).join('');
}

async function submitFeedback() {
    const input = document.getElementById('fbInput');
    const btn = document.getElementById('fbSubmit');
    const text = (input ? input.value : '').trim();

    if (!text) {
        showToast('请输入反馈内容', 'warning');
        return;
    }

    btn.disabled = true;
    btn.textContent = '提交中...';

    try {
        const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        const res = await fetch(API_BASE + '/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: text,
                userAgent: navigator.userAgent,
                userId: user ? user.id : ''
            })
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '提交失败');

        showToast('反馈提交成功，感谢支持！', 'success');
        input.value = '';
        loadFeedbackList();
    } catch (e) {
        showToast('提交失败：' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> <span>提交反馈</span>`;
    }
}

// ========== 管理后台 ==========
function initAdminPage() {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (!user || user.role !== 'admin') return;
    loadAdminFeedback();
    loadAdminUsers();
}

async function loadAdminFeedback() {
    const container = document.getElementById('admFbList');
    if (!container) return;

    try {
        const res = await fetch(API_BASE + '/feedback?' + Date.now());
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '加载失败');
        if (!d.feedbacks.length) {
            container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">暂无反馈</div>';
            return;
        }
        container.innerHTML = d.feedbacks.map(f => `
            <div class="fb-item">
                <div class="fb-header">
                    ${f.userId
                        ? `<div class="fb-user" onclick="showUserInfo('${escapeHtml(f.userId)}')"><img class="fb-avatar" src="${escapeHtml(f.userAvatar || DEFAULT_AVATAR)}"><span class="fb-username">${escapeHtml(f.username || '匿名')}</span></div>`
                        : '<span style="font-size:12px;color:var(--text-secondary);">匿名用户</span>'}
                    <span class="fb-time">${escapeHtml(formatDateTime(f.timestamp))}</span>
                </div>
                <div class="fb-text">${escapeHtml(f.content)}</div>
                <button class="fb-del" onclick="deleteFeedback(${f.id})">${ICONS.trash} 删除</button>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">加载失败：${escapeHtml(e.message)}</div>`;
    }
}

async function loadAdminUsers() {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    const container = document.getElementById('admUserList');
    if (!container || !user) return;

    try {
        const res = await fetch(API_BASE + '/admin/users?userId=' + encodeURIComponent(user.id));
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '加载失败');
        if (!d.users.length) {
            container.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">暂无用户</div>';
            return;
        }
        container.innerHTML = d.users.map(u => `
            <div class="user-row">
                <div>
                    <span style="font-weight:600;color:#fff;">${escapeHtml(u.username)}</span>
                    ${u.role === 'admin' ? `<span class="tag-admin">${ICONS.crown} 管理员</span>` : ''}
                    ${u.status === 'banned' ? '<span class="tag-banned">已封禁</span>' : ''}
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;font-family:'JetBrains Mono',monospace;">
                        UID ${escapeHtml(u.uid)} · ${escapeHtml(u.email)}${u.qq ? ' · QQ: ' + escapeHtml(u.qq) : ''}
                    </div>
                </div>
                <div>
                    ${u.id === user.id
                        ? '<span style="color:var(--text-secondary);font-size:12px;">（当前）</span>'
                        : (u.status === 'banned'
                            ? `<button class="unban-btn" onclick="setUserStatus('${u.id}','active')">${ICONS.unlock} 解封</button>`
                            : `<button class="ban-btn" onclick="setUserStatus('${u.id}','banned')">${ICONS.lock} 封禁</button>`)}
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">加载失败：${escapeHtml(e.message)}</div>`;
    }
}

async function setUserStatus(id, status) {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (!user || user.role !== 'admin') return showToast('权限不足', 'error');
    
    const action = status === 'banned' ? '封禁' : '解封';
    if (!confirm(`确定要${action}该用户账号吗？`)) return;

    try {
        const res = await fetch(API_BASE + '/admin/users/' + id + '/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, status })
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '操作失败');
        showToast(`已${action}`, 'success');
        loadAdminUsers();
    } catch (e) {
        showToast(`${action}失败：` + e.message, 'error');
    }
}

async function deleteFeedback(id) {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    if (!user || user.role !== 'admin') return showToast('权限不足', 'error');
    if (!confirm('确定删除该条反馈吗？')) return;

    try {
        const res = await fetch(API_BASE + '/feedback/' + id + '?userId=' + encodeURIComponent(user.id), {
            method: 'DELETE'
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error || '删除失败');
        showToast('已删除', 'success');
        loadFeedbackList();
        const adm = document.getElementById('admFbList');
        if (adm) loadAdminFeedback();
    } catch (e) {
        showToast('删除失败：' + e.message, 'error');
    }
}

// ========== 下载 ==========
function Rdownload() {
    const os = document.getElementById('resamplerOS').value;
    const version = document.getElementById('resamplerVersion').value;

    if (version.includes('(Beta)')) {
        showToast('正在下载测试版本', 'info');
    }

    let file = '';
    if (os === 'windows') {
        file = 'WIN/resampler.zip';
    } else {
        file = '404.html';
    }

    const a = document.createElement('a');
    a.href = file;
    a.click();
}

// ========== 入口 ==========
window.addEventListener('hashchange', renderPage);

window.onload = () => {
    initKineticCursor();
    initCyberWaves();
    renderUserBar();
    bindModalEvents();
    bindTabSwitch();
    bindLoginRegister();
    bindAvatarBoxClick();
    bindAvatarUpload();
    bindMobileNav();

    renderPage();
};

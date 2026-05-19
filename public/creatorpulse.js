// ─── CreatorPulse JS ──────────────────────────────────
const SUPABASE_URL = 'https://mwefmtmcljdsptcgowmb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SdGsB-hhvxF2-rq_fBiM0A_y3_mQn2n';
let db, currentUser = null, currentProfile = null, allPosts = [], activeFilter = 'all', activeTag = null;
let selectedImageFile = null;

// ─── Init ─────────────────────────────────────────────
async function init() {
    try {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        await checkUser();
    } catch(e) { console.warn('Supabase init error:', e); }
    
    await Promise.all([
        loadPosts(),
        loadLiveOpportunities(),
        loadActiveCampaigns()
    ]);
    
    setupListeners();
    setupRealtime();
    if (window.lucide) lucide.createIcons();
}

// ─── Realtime Subscriptions ──────────────────────────
function setupRealtime() {
    if (!db) return;
    
    db.channel('public-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'creatorpulse_posts' }, () => {
            loadPosts();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, () => {
            loadLiveOpportunities();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
            loadLiveOpportunities();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'creatorpulse_likes' }, () => {
            loadPosts();
        })
        .subscribe();
}

// ─── Auth ─────────────────────────────────────────────
async function checkUser() {
    try {
        const { data: { user } } = await db.auth.getUser();
        if (!user) return;
        currentUser = user;
        const { data: profile } = await db.from('user_profiles').select('*').eq('user_id', user.id).single();
        currentProfile = profile;
        updateAuthUI(user, profile);
    } catch(e) { console.warn('Auth check:', e); }
}

function updateAuthUI(user, profile) {
    const meta = user.user_metadata || {};
    const name = profile?.name || meta.full_name || meta.user_name || 'User';
    const avatar = profile?.avatar_url || meta.avatar_url || meta.picture || `https://unavatar.io/twitter/${meta.user_name||'user'}`;
    const handle = profile?.username || meta.user_name || 'user';

    const authContainer = document.getElementById('auth-nav-box');
    if (authContainer) {
        authContainer.innerHTML = `
            <div class="profile-dropdown" style="position: relative;">
                <div class="profile-dropdown-trigger" onclick="toggleProfileDropdown(event)">
                    <img class="user-avatar" src="${avatar}" onerror="this.src='/logo.png'">
                    <span class="user-name-display">${escHtml(name)}</span>
                    <i data-lucide="chevron-down" class="caret-icon"></i>
                </div>
                <div class="post-dropdown-menu" id="profile-dropdown-menu">
                    <a href="/my-profile.html" class="dropdown-action-btn" style="text-decoration:none;display:block">My Profile</a>
                    <button class="dropdown-action-btn danger" onclick="signOut()">Sign Out</button>
                </div>
            </div>`;
    }

    const ca = document.getElementById('composer-avatar');
    if (ca) {
        ca.innerHTML = `<img class="post-card-avatar" src="${avatar}" onerror="this.src='/logo.png'">`;
    }
    
    if (window.lucide) lucide.createIcons();
}

function toggleProfileDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('profile-dropdown-menu');
    if (menu) {
        menu.classList.toggle('show');
    }
}

function openAuthModal() { 
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'flex'; 
}

function closeAuthModal() { 
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none'; 
}

async function signInWithGoogle() {
    const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/auth/callback' } });
    if (error) showToast('Google auth failed', 'error');
}

async function signInWithX() {
    const { error } = await db.auth.signInWithOAuth({ provider: 'x', options: { redirectTo: location.origin + '/auth/callback' } });
    if (error) showToast('X auth failed', 'error');
}

async function signOut() { 
    await db.auth.signOut(); 
    location.reload(); 
}

// ─── Load Posts ───────────────────────────────────────
async function loadPosts() {
    try {
        const { data, error } = await db.from('creatorpulse_posts').select('*').order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        if (!data || data.length === 0) { renderEmpty(); updateStats([]); return; }

        const userIds = [...new Set(data.map(p => p.user_id))];
        const { data: profiles } = await db.from('user_profiles').select('user_id,name,username,avatar_url').in('user_id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => profileMap[p.user_id] = p);

        let likedSet = new Set();
        if (currentUser) {
            const { data: likes } = await db.from('creatorpulse_likes').select('post_id').eq('user_id', currentUser.id);
            (likes || []).forEach(l => likedSet.add(l.post_id));
        }

        allPosts = data.map(p => ({ ...p, profile: profileMap[p.user_id] || null, liked: likedSet.has(p.id) }));
        renderPosts(filterPosts());
        updateStats(allPosts);
    } catch(e) {
        console.error('Load posts error:', e);
        renderEmpty();
    }
}

function filterPosts() {
    let posts = [...allPosts];
    if (activeTag) posts = posts.filter(p => p.content.toLowerCase().includes('#' + activeTag.toLowerCase()));
    
    if (activeFilter === 'hiring') {
        posts = posts.filter(p => /#hiring/i.test(p.content));
    } else if (activeFilter === 'popular') {
        posts.sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
    } else if (activeFilter === 'recent') {
        posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return posts;
}

function renderPosts(posts) {
    const container = document.getElementById('pulse-container');
    if (!container) return;
    if (!posts.length) { renderEmpty(); return; }
    
    const emptyBox = document.getElementById('feed-empty');
    if (emptyBox) emptyBox.style.display = 'none';
    
    container.innerHTML = posts.map(renderPostCard).join('');
    if (window.lucide) lucide.createIcons();
}

function renderEmpty() {
    const container = document.getElementById('pulse-container');
    if (container) container.innerHTML = '';
    const emptyBox = document.getElementById('feed-empty');
    if (emptyBox) emptyBox.style.display = 'block';
}

function renderPostCard(post) {
    const p = post.profile || {};
    const name = p.name || 'CreatorChain User';
    const handle = p.username || 'user';
    const avatar = p.avatar_url || '/logo.png';
    const content = formatContent(post.content);
    const edited = post.is_edited ? '<span class="post-edited-label">(edited)</span>' : '';
    const isOwn = currentUser && currentUser.id === post.user_id;
    const likedClass = post.liked ? 'liked' : '';
    
    const heartIcon = `<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    const commentIcon = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    const shareIcon = `<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;
    const menuIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;

    const imageHtml = post.image_url ? `
        <div class="post-card-image-wrap">
            <img src="${post.image_url}" alt="Post image" onclick="window.open(this.src)">
        </div>
    ` : '';

    const hashtags = (post.content.match(/#\w+/g) || []).map(tag => tag.substring(1));
    const tagsHtml = hashtags.length ? `
        <div class="post-category-tag-row">
            ${hashtags.map(t => {
                const lower = t.toLowerCase();
                let categoryClass = '';
                if (lower === 'hiring') categoryClass = 'campaign';
                else if (lower === 'bounty') categoryClass = 'bounty';
                return `<span class="category-tag ${categoryClass}">#${escHtml(t)}</span>`;
            }).join('')}
        </div>
    ` : '';

    return `<div class="post-card" id="post-${post.id}">
        <div class="post-card-header">
            <div class="post-card-author-info">
                <img class="post-card-avatar" src="${avatar}" onerror="this.src='/logo.png'">
                <div class="author-meta-block">
                    <div class="author-name-row">
                        <span class="author-display-name">${escHtml(name)}</span>
                        ${p.verified ? `<svg class="verified-badge" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>` : ''}
                        <span class="author-handle">@${escHtml(handle)}</span>
                    </div>
                    <span class="post-time-ago">${timeAgo(post.created_at)}</span>
                </div>
            </div>
            ${isOwn ? `<div class="post-dropdown">
                <button class="post-card-menu-btn" onclick="togglePostMenu('${post.id}')">${menuIcon}</button>
                <div class="post-dropdown-menu" id="menu-${post.id}">
                    <button class="dropdown-action-btn" onclick="editPost('${post.id}')">Edit</button>
                    <button class="dropdown-action-btn danger" onclick="deletePost('${post.id}')">Delete</button>
                </div>
            </div>` : ''}
        </div>
        <div class="post-card-body">
            <div class="post-card-text">${content}${edited}</div>
            ${imageHtml}
            ${tagsHtml}
        </div>
        <div class="post-card-actions">
            <button class="action-trigger ${likedClass}" onclick="toggleLike('${post.id}')">
                ${heartIcon} <span id="likes-${post.id}">${post.like_count || 0}</span>
            </button>
            <button class="action-trigger" onclick="toggleComments('${post.id}')">
                ${commentIcon} <span id="comments-count-${post.id}">${post.comment_count || 0}</span>
            </button>
            <button class="action-trigger" onclick="sharePost('${post.id}')">
                ${shareIcon} Share
            </button>
        </div>
        <div class="replies-section" id="comments-${post.id}">
            <div class="replies-list" id="comments-list-${post.id}"></div>
            <div class="reply-composer-wrap">
                <input class="reply-composer-input" id="ci-${post.id}" placeholder="Write a reply..." maxlength="500" onkeydown="if(event.key==='Enter')addComment('${post.id}')">
                <button class="reply-send-btn" onclick="addComment('${post.id}')">Reply</button>
            </div>
        </div>
    </div>`;
}

// ─── Format Content ───────────────────────────────────
function formatContent(text) {
    let s = escHtml(text);
    s = s.replace(/#(\w+)/g, '<span class="hashtag" onclick="filterByTag(\'$1\')">#$1</span>');
    s = s.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    return s.replace(/\n/g, '<br>');
}
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ─── Image Preview & Removal Handlers ──────────────────
function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size exceeds 5MB limit.', 'error');
        event.target.value = '';
        return;
    }
    
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        const frame = document.getElementById('image-preview-frame');
        const img = document.getElementById('image-preview-img');
        if (img) img.src = e.target.result;
        if (frame) frame.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function removeSelectedImage(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    selectedImageFile = null;
    const fileInput = document.getElementById('post-image-file');
    if (fileInput) fileInput.value = '';
    const frame = document.getElementById('image-preview-frame');
    if (frame) frame.style.display = 'none';
    const img = document.getElementById('image-preview-img');
    if (img) img.src = '';
}

// ─── Create Post ──────────────────────────────────────
async function createPost() {
    if (!currentUser) { openAuthModal(); return; }
    const input = document.getElementById('post-input');
    const content = input.value.trim();
    if (!content && !selectedImageFile) return;
    const btn = document.getElementById('post-btn');
    btn.disabled = true; btn.innerHTML = 'Posting...';
    try {
        let imageUrl = null;
        if (selectedImageFile) {
            const fileExt = selectedImageFile.name.split('.').pop();
            const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
            const filePath = `public/${fileName}`;
            
            const { data, error: uploadError } = await db.storage
                .from('logos')
                .upload(filePath, selectedImageFile, {
                    cacheControl: '3600',
                    upsert: false
                });
                
            if (uploadError) {
                console.error("Storage upload error:", uploadError);
                throw new Error("Image upload failed: " + uploadError.message);
            }
            
            const { data: { publicUrl } } = db.storage
                .from('logos')
                .getPublicUrl(filePath);
                
            imageUrl = publicUrl;
        }

        const { error } = await db.from('creatorpulse_posts').insert({ 
            user_id: currentUser.id, 
            content,
            image_url: imageUrl
        });
        if (error) throw error;
        
        input.value = '';
        removeSelectedImage();
        document.getElementById('char-current').textContent = '0';
        showToast('Pulse shared! 🚀');
        await loadPosts();
    } catch(e) {
        console.error(e);
        showToast(e.message || 'Failed to post. Try again.', 'error');
    }
    btn.disabled = false; btn.innerHTML = '<span>Post</span><i data-lucide="send"></i>';
    if (window.lucide) lucide.createIcons();
}

// ─── Like ─────────────────────────────────────────────
async function toggleLike(postId) {
    if (!currentUser) { openAuthModal(); return; }
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    const btn = document.querySelector(`#post-${postId} .action-trigger`);
    try {
        if (post.liked) {
            await db.from('creatorpulse_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id);
            post.liked = false;
            post.like_count = Math.max(0, (post.like_count || 1) - 1);
            if (btn) btn.classList.remove('liked');
        } else {
            await db.from('creatorpulse_likes').insert({ post_id: postId, user_id: currentUser.id });
            post.liked = true;
            post.like_count = (post.like_count || 0) + 1;
            if (btn) {
                btn.classList.add('liked');
            }
        }
        const counter = document.getElementById(`likes-${postId}`);
        if (counter) counter.textContent = post.like_count;
    } catch(e) { console.error(e); showToast('Like failed', 'error'); }
}

// ─── Comments ─────────────────────────────────────────
async function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;
    if (section.classList.contains('open')) { section.classList.remove('open'); return; }
    section.classList.add('open');
    await loadComments(postId);
}

async function loadComments(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;
    list.innerHTML = '<div class="mono" style="font-size:11px;color:var(--text-dim);padding:8px 0">Loading...</div>';
    try {
        const { data, error } = await db.from('creatorpulse_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
        if (error) throw error;
        if (!data || !data.length) { list.innerHTML = '<div class="mono" style="font-size:11px;color:var(--text-dim);padding:8px 0">No replies yet.</div>'; return; }

        const userIds = [...new Set(data.map(c => c.user_id))];
        const { data: profiles } = await db.from('user_profiles').select('user_id,name,username,avatar_url').in('user_id', userIds);
        const pm = {};
        (profiles || []).forEach(p => pm[p.user_id] = p);

        list.innerHTML = data.map(c => {
            const cp = pm[c.user_id] || {};
            const isOwn = currentUser && currentUser.id === c.user_id;
            return `<div class="reply-item">
                <img class="reply-avatar" src="${cp.avatar_url || '/logo.png'}" onerror="this.src='/logo.png'">
                <div class="reply-body">
                    <div class="reply-author-meta">
                        <span class="reply-author-name">${escHtml(cp.name || 'User')}</span>
                        <span class="reply-time">${timeAgo(c.created_at)}</span>
                    </div>
                    <div class="reply-content-text">${escHtml(c.content)}</div>
                </div>
                ${isOwn ? `<button class="reply-delete-btn" onclick="deleteComment('${c.id}','${postId}')">✕</button>` : ''}
            </div>`;
        }).join('');
    } catch(e) { list.innerHTML = '<div style="color:var(--accent);font-size:12px">Error loading comments</div>'; }
}

async function addComment(postId) {
    if (!currentUser) { openAuthModal(); return; }
    const input = document.getElementById(`ci-${postId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    try {
        const { error } = await db.from('creatorpulse_comments').insert({ post_id: postId, user_id: currentUser.id, content });
        if (error) throw error;
        input.value = '';
        await loadComments(postId);
        const post = allPosts.find(p => p.id === postId);
        if (post) { 
            post.comment_count = (post.comment_count || 0) + 1; 
            const counter = document.getElementById(`comments-count-${postId}`);
            if (counter) counter.textContent = post.comment_count; 
        }
    } catch(e) { showToast('Comment failed', 'error'); }
}

async function deleteComment(commentId, postId) {
    if (!confirm('Delete this reply?')) return;
    try {
        await db.from('creatorpulse_comments').delete().eq('id', commentId);
        await loadComments(postId);
        const post = allPosts.find(p => p.id === postId);
        if (post) { 
            post.comment_count = Math.max(0, (post.comment_count || 1) - 1); 
            const counter = document.getElementById(`comments-count-${postId}`);
            if (counter) counter.textContent = post.comment_count; 
        }
    } catch(e) { showToast('Delete failed', 'error'); }
}

// ─── Post Actions ─────────────────────────────────────
function togglePostMenu(postId) {
    document.querySelectorAll('.post-dropdown-menu').forEach(m => { 
        if(m.id !== `menu-${postId}`) m.classList.remove('show'); 
    });
    const menu = document.getElementById(`menu-${postId}`);
    if (menu) menu.classList.toggle('show');
}

async function deletePost(postId) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
        await db.from('creatorpulse_posts').delete().eq('id', postId);
        showToast('Post deleted');
        await loadPosts();
    } catch(e) { showToast('Delete failed', 'error'); }
}

async function editPost(postId) {
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    const newContent = prompt('Edit your post:', post.content);
    if (newContent === null || !newContent.trim()) return;
    try {
        await db.from('creatorpulse_posts').update({ content: newContent.trim(), is_edited: true, updated_at: new Date().toISOString() }).eq('id', postId);
        showToast('Post updated ✏️');
        await loadPosts();
    } catch(e) { showToast('Edit failed', 'error'); }
}

function sharePost(postId) {
    const url = `${location.origin}/creatorpulse.html?post=${postId}`;
    if (navigator.share) {
        navigator.share({ title: 'CreatorPulse Post', url }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url);
        showToast('Pulse link copied! 📋');
    }
}

// ─── Filters & Tags ──────────────────────────────────
function filterByTag(tag) {
    activeTag = activeTag === tag ? null : tag;
    renderPosts(filterPosts());
}

// ─── Live Widgets Loading ────────────────────────────
async function loadLiveOpportunities() {
    const list = document.getElementById('live-bounties-list');
    if (!list) return;
    try {
        const { data: opps, error: oppsError } = await db.from('opportunities')
            .select('id, project_name, reward, created_at, external_link')
            .eq('status', 'live');
            
        const { data: listings, error: lError } = await db.from('listings')
            .select('id, project, reward, created_at, apply_url')
            .eq('approval_status', 'approved');

        if (oppsError && lError) throw new Error('Failed to fetch');

        let allData = [];
        if (opps) allData = allData.concat(opps.map(o => ({ id: o.id, name: o.project_name, reward: o.reward, created_at: o.created_at, link: o.external_link })));
        if (listings) allData = allData.concat(listings.map(l => ({ id: l.id, name: l.project, reward: l.reward, created_at: l.created_at, link: l.apply_url })));

        allData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const top3 = allData.slice(0, 3);

        if (top3.length === 0) {
            renderEmptyBounties();
            return;
        }

        list.innerHTML = top3.map(item => {
            const reward = item.reward || 'Bounty';
            const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
            return `
                <a href="/opportunity.html?id=${item.id}" class="widget-opp-row">
                    <div class="opp-left-section">
                        <div class="opp-icon-wrapper">
                            ${icon}
                        </div>
                        <div class="opp-info-block">
                            <span class="opp-row-title">${escHtml(item.name || 'Project')}</span>
                            <span class="opp-row-amount">${escHtml(reward)}</span>
                        </div>
                    </div>
                    <div class="opp-right-section">
                        <span class="live-indicator">LIVE</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opp-arrow-icon" style="width:14px;height:14px;"><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                </a>
            `;
        }).join('');
    } catch(e) {
        renderEmptyBounties();
    }
}

function renderEmptyBounties() {
    const list = document.getElementById('live-bounties-list');
    if (!list) return;
    list.innerHTML = `
        <div style="font-size: 12px; color: var(--text-dim); font-family: var(--font-mono); padding: 12px 0;">
            No live opportunities at the moment.
        </div>
    `;
}

function loadActiveCampaigns() {
    const list = document.getElementById('active-campaigns-list');
    if (!list) return;
    const campaigns = [
        { title: 'CreatorChain Genesis', joins: '428 creators joined', icon: 'zap' },
        { title: 'Builders Guild Wave 1', joins: '184 builders active', icon: 'users' },
        { title: 'Superteam Hackathon Referral', joins: '94 referrals logged', icon: 'award' }
    ];
    list.innerHTML = campaigns.map(c => {
        return `
            <div class="widget-campaign-row" style="margin-bottom: 12px;">
                <div class="camp-left-section">
                    <div class="camp-icon-wrapper">
                        <i data-lucide="${c.icon}"></i>
                    </div>
                    <div class="camp-info-block">
                        <span class="camp-row-title">${escHtml(c.title)}</span>
                        <span class="camp-row-joins">${escHtml(c.joins)}</span>
                    </div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="camp-trend-icon" style="width:16px;height:16px;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
        `;
    }).join('');
}

// ─── Helpers ──────────────────────────────────────────
function timeAgo(ts) {
    const d = new Date(ts), now = new Date(), diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
}

function insertEmoji(e) {
    const input = document.getElementById('post-input');
    if (!input) return;
    const start = input.selectionStart, end = input.selectionEnd;
    input.value = input.value.substring(0, start) + e + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + e.length;
    input.focus();
    const counter = document.getElementById('char-current');
    if (counter) counter.textContent = input.value.length;
}

function updateStats(posts) {
    // Stats elements removed from main 3-column layout
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast-item ${type === 'error' ? 'error' : ''}`;
    
    let icon = `<svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    if (type === 'error') {
        icon = `<svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    }
    
    el.innerHTML = `${icon} <span>${escHtml(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// ─── Setup ────────────────────────────────────────────
function setupListeners() {
    const input = document.getElementById('post-input');
    if (input) {
        input.addEventListener('input', () => {
            const len = input.value.length;
            const counter = document.getElementById('char-current');
            if (counter) {
                counter.textContent = len;
                counter.parentElement.classList.toggle('warn', len > 450);
            }
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderPosts(filterPosts());
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.post-dropdown')) {
            document.querySelectorAll('.post-dropdown-menu').forEach(m => m.classList.remove('show'));
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

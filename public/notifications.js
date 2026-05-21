// CreatorChain Real-Time Notifications System
// Connects the header bell notification dynamically to Supabase approved listings

(function() {
    let checkInterval = null;
    let itemsList = [];

    // Initialize when DOM is ready and Supabase is loaded
    function initWhenReady() {
        checkInterval = setInterval(() => {
            const supabaseClient = window.db || window.supabaseClient || (typeof db !== 'undefined' ? db : null);
            if (supabaseClient && typeof supabaseClient.from === 'function') {
                clearInterval(checkInterval);
                initRealtimeNotifications(supabaseClient);
            }
        }, 100);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
        initWhenReady();
    }

    function initRealtimeNotifications(supabaseDb) {
        const bellBtn = document.querySelector('.bell-btn');
        const badge = document.getElementById('notifBadge');
        const menu = document.getElementById('notificationMenu');
        if (!bellBtn || !menu) return;

        // Fetch recent approved listings on load
        fetchRecentOpportunities(supabaseDb);

        // Setup real-time listener for listings and opportunities table updates
        try {
            supabaseDb.channel('public:listings')
                .on('postgres_changes', { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'listings' 
                }, payload => {
                    if (payload.new && payload.new.approval_status === 'approved') {
                        handleNewOpportunity(payload.new);
                    }
                })
                .on('postgres_changes', { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'listings' 
                }, payload => {
                    if (payload.new && payload.new.approval_status === 'approved' && (!payload.old || payload.old.approval_status !== 'approved')) {
                        handleNewOpportunity(payload.new);
                    }
                })
                .subscribe();

            supabaseDb.channel('public:opportunities')
                .on('postgres_changes', { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'opportunities' 
                }, payload => {
                    if (payload.new && payload.new.status === 'live') {
                        handleNewOpportunity(payload.new);
                    }
                })
                .on('postgres_changes', { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'opportunities' 
                }, payload => {
                    if (payload.new && payload.new.status === 'live' && (!payload.old || payload.old.status !== 'live')) {
                        handleNewOpportunity(payload.new);
                    }
                })
                .subscribe();
        } catch (e) {
            console.warn('Realtime subscription failed, falling back to static load:', e);
        }

        async function fetchRecentOpportunities(db) {
            try {
                const [listingsRes, oppsRes] = await Promise.all([
                    db.from('listings')
                        .select('id, title, project, reward, approval_status, created_at, reviewed_at')
                        .eq('approval_status', 'approved')
                        .order('created_at', { ascending: false })
                        .limit(5),
                    db.from('opportunities')
                        .select('id, title, project_name, reward, status, created_at')
                        .eq('status', 'live')
                        .order('created_at', { ascending: false })
                        .limit(5)
                ]);

                const listings = (listingsRes.data || []).map(item => ({
                    id: item.id,
                    title: item.title,
                    project: item.project || 'Project',
                    reward: item.reward,
                    created_at: item.created_at || item.reviewed_at || new Date().toISOString()
                }));

                const opportunities = (oppsRes.data || []).map(item => ({
                    id: item.id,
                    title: item.title,
                    project: item.project_name || 'Project',
                    reward: item.reward,
                    created_at: item.created_at || new Date().toISOString()
                }));

                // Combine, sort descending by created_at, and limit to 5
                itemsList = [...listings, ...opportunities]
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                    .slice(0, 5);

                if (itemsList.length > 0) {
                    renderNotifications(itemsList);
                } else {
                    renderEmptyNotifications();
                }
            } catch (e) {
                console.error('Error fetching notifications:', e);
                renderEmptyNotifications();
            }
        }

        function handleNewOpportunity(opp) {
            // Re-fetch notifications list to display it fresh
            fetchRecentOpportunities(supabaseDb);
        }

        function renderNotifications(items) {
            // Locate or construct header HTML
            const header = menu.querySelector('.notification-header') || menu.querySelector('div:first-child');
            const headerText = header ? header.outerHTML : `<div class="notification-header" style="background:var(--black); color:#fff; padding:10px 15px; font-family:'Space Mono', monospace; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing: 1px;">NOTIFICATIONS</div>`;
            
            let html = headerText;

            // Check what was the last seen notification timestamp in localStorage
            const lastSeenTime = localStorage.getItem('cc_last_seen_notif_time') || '1970-01-01T00:00:00.000Z';
            let unreadCount = 0;
            const latestNotifTime = items[0].created_at || items[0].reviewed_at || new Date().toISOString();

            items.forEach(opp => {
                const timeStr = opp.created_at || opp.reviewed_at || new Date().toISOString();
                const isUnread = new Date(timeStr) > new Date(lastSeenTime);
                if (isUnread) unreadCount++;

                const oppUrl = `/opportunity?id=${opp.id}`;
                const oppReward = opp.reward ? `Reward: ${opp.reward}` : 'Reward: TBA';

                html += `
                    <a href="${oppUrl}" class="notification-item ${isUnread ? 'unread' : ''}" style="display:block; padding:15px; border-bottom:2px solid var(--black); text-decoration:none; color:var(--black); transition:0.2s;" onclick="markAsSeen('${latestNotifTime}');">
                        <div style="font-weight:900; font-size:13px; margin-bottom:4px;">${opp.project || 'Project'} - ${opp.title || 'Opportunity'}</div>
                        <div style="font-size:12px; color:var(--muted, #666); line-height:1.4;">${oppReward}</div>
                        <div style="font-family:'Space Mono', monospace; font-size:10px; color:#888; margin-top:6px;">${timeAgo(timeStr)}</div>
                    </a>
                `;
            });

            menu.innerHTML = html;

            // Handle badge and ringing state
            if (unreadCount > 0) {
                if (badge) {
                    badge.textContent = unreadCount;
                    badge.style.display = 'flex';
                }
                bellBtn.classList.add('ringing');
            } else {
                if (badge) badge.style.display = 'none';
                bellBtn.classList.remove('ringing');
            }
        }

        function renderEmptyNotifications() {
            const header = menu.querySelector('.notification-header') || menu.querySelector('div:first-child');
            const headerText = header ? header.outerHTML : `<div class="notification-header" style="background:var(--black); color:#fff; padding:10px 15px; font-family:'Space Mono', monospace; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing: 1px;">NOTIFICATIONS</div>`;
            menu.innerHTML = `
                ${headerText}
                <div style="padding: 25px 15px; text-align: center; font-family: 'Space Mono', monospace; font-size: 11px; color: #888;">
                    No new opportunities yet.
                </div>
            `;
            if (badge) badge.style.display = 'none';
            bellBtn.classList.remove('ringing');
        }

        window.markAsSeen = function(timestamp) {
            localStorage.setItem('cc_last_seen_notif_time', timestamp);
            if (badge) badge.style.display = 'none';
            bellBtn.classList.remove('ringing');
        };

        // Override/define global toggleNotificationMenu to handle open, close, and mark as seen
        window.toggleNotificationMenu = function() {
            const isMenuFlex = menu.style.display === 'flex';
            const isMenuShow = menu.classList.contains('show');
            const isOpen = isMenuFlex || isMenuShow;

            if (isOpen) {
                // Closing
                menu.style.display = 'none';
                menu.classList.remove('show');
            } else {
                // Opening
                menu.classList.add('show');
                menu.style.display = 'flex';

                // Mark all current loaded notifications as seen
                const latestTime = itemsList && itemsList[0] ? (itemsList[0].created_at || itemsList[0].reviewed_at) : new Date().toISOString();
                window.markAsSeen(latestTime);
                
                // remove unread styling visually on items
                menu.querySelectorAll('.notification-item').forEach(item => {
                    item.classList.remove('unread');
                });
            }
        };

        // Auto-close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.notification-container')) {
                menu.style.display = 'none';
                menu.classList.remove('show');
            }
        });
    }

    function timeAgo(ts) {
        const d = new Date(ts);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }
})();

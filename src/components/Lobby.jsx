import React, { useMemo, useState, useCallback } from 'react';
import { myPlayer, usePlayersList, isHost } from 'playroomkit';
import { usePhase, useTimer, useLengths, useRolesAssigned } from '../network/playroom';

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────
const TEAMS = [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
    { id: 'gamma', name: 'Gamma' },
    { id: 'delta', name: 'Delta' },
];

const ROLES = ['Engineer', 'Research', 'StationDirector', 'Officer', 'Guard', 'FoodSupplier'];

// Privacy: hide roles across teams; host can optionally see all
const PRIVACY_HIDE_ROLES_CROSS_TEAM = true;
const HOST_CAN_VIEW_ALL = true;

// Launch rules (set as you like)
const MIN_PLAYERS = 2;
const REQUIRE_ROLE_FOR_ALL = false;
const REQUIRE_TEAM_FOR_ALL = false;
const REQUIRE_FULL_TEAMS = false;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function getPState(p, key, fallback = undefined) {
    try {
        if (p?.state && key in p.state) return p.state[key];
        if (typeof p?.getState === 'function') return p.getState(key) ?? fallback;
    } catch { }
    return fallback;
}
function setMyState(key, value) {
    const me = myPlayer?.();
    if (!me) return;
    try {
        if (typeof me.setState === 'function') me.setState(key, value, true);
        else if (me.state) me.state[key] = value;
    } catch { }
}
function getPlayerName(p) {
    return p?.getProfile?.().name || getPState(p, 'name', p?.name || `Player-${String(p?.id || '').slice(-4)}`);
}
function teamOf(p) { return getPState(p, 'team', null); }
function roleOf(p) { return getPState(p, 'role', ''); }

function leaderIdForTeam(players, teamId) {
    const teamers = players.filter(p => teamOf(p) === teamId);
    if (teamers.length === 0) return null;
    const sorted = [...teamers].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const explicit = sorted.find(p => getPState(p, 'isLeader', false));
    return explicit ? explicit.id : sorted[0].id;
}

// Can current viewer see target player's role?
function canSeeRole(viewer, target, iAmHost) {
    if (!PRIVACY_HIDE_ROLES_CROSS_TEAM) return true;
    if (HOST_CAN_VIEW_ALL && iAmHost) return true;
    return teamOf(viewer) && teamOf(viewer) === teamOf(target);
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export default function Lobby() {
    const players = usePlayersList(true);
    const iAmHost = isHost?.() ?? false;

    const [phase, setPhase] = usePhase();
    const [, setTimer] = useTimer();
    const { dayLength } = useLengths();
    const [, setRolesAssigned] = useRolesAssigned();

    const [tab, setTab] = useState('team'); // 'team' | 'launch' (invite lives inside your team view)

    // URL param auto-join (?team=alpha)
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const invitedTeam = params.get('team');
        if (invitedTeam && TEAMS.some(t => t.id === invitedTeam)) {
            setTimeout(() => attemptJoinTeam(invitedTeam), 50);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Roster map
    const rosterByTeam = useMemo(() => {
        const map = Object.fromEntries(TEAMS.map(t => [t.id, []]));
        for (const p of players) {
            const t = teamOf(p);
            if (t && map[t]) map[t].push(p);
        }
        for (const t of TEAMS) {
            map[t.id].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        }
        return map;
    }, [players]);

    const viewer = myPlayer?.();
    const myId = viewer?.id;
    const me = players.find(p => p.id === myId);
    const myTeam = me ? teamOf(me) : null;
    const myRole = me ? roleOf(me) : '';

    const myLeaderId = useMemo(() => myTeam ? leaderIdForTeam(players, myTeam) : null, [players, myTeam]);
    const myIsLeader = myLeaderId === myId;

    // Team join/leave
    const attemptJoinTeam = useCallback((teamId) => {
        const current = rosterByTeam[teamId] || [];
        if (current.length >= 3) { alert(`Team ${teamId.toUpperCase()} is full (3/3).`); return false; }
        setMyState('team', teamId);

        // Ensure no duplicate role clash on join
        if (myRole && current.some(p => roleOf(p) === myRole)) {
            const taken = new Set(current.map(roleOf));
            const free = ROLES.find(r => !taken.has(r)) || '';
            setMyState('role', free);
        }
        return true;
    }, [rosterByTeam, myRole]);

    const leaveTeam = useCallback(() => {
        setMyState('team', null);
    }, []);

    // Role pick (unique within team)
    const setRole = useCallback((newRole) => {
        if (myTeam) {
            const taken = new Set((rosterByTeam[myTeam] || []).map(roleOf));
            if (taken.has(newRole)) { alert(`Role "${newRole}" already taken in ${myTeam.toUpperCase()}.`); return; }
        }
        setMyState('role', newRole);
    }, [myTeam, rosterByTeam]);

    // Leader override
    const makeLeader = useCallback((teamId, playerId) => {
        if (!isHost?.()) return;
        for (const p of players) {
            if (teamOf(p) === teamId) {
                p.setState?.('isLeader', p.id === playerId, true);
            }
        }
    }, [players]);

    // Invite link (team-specific; preserves ?r= room code if present)
    const inviteLinkFor = useCallback((teamId) => {
        const url = new URL(window.location.href);
        url.searchParams.set('team', teamId);
        return url.toString();
    }, []);

    const copyLink = useCallback(async (teamId) => {
        const link = inviteLinkFor(teamId);
        try { await navigator.clipboard.writeText(link); alert(`Copied link for ${teamId.toUpperCase()}:\n${link}`); }
        catch { prompt(`Copy the link for ${teamId.toUpperCase()}:`, link); }
    }, [inviteLinkFor]);

    const shareLink = useCallback(async (teamId) => {
        const link = inviteLinkFor(teamId);
        if (navigator.share) {
            try { await navigator.share({ title: `Join ${teamId.toUpperCase()} Team`, url: link }); } catch { }
        } else {
            copyLink(teamId);
        }
    }, [inviteLinkFor, copyLink]);

    // Launch gating
    const launchIssues = useMemo(() => {
        const issues = [];
        if (players.length < MIN_PLAYERS) issues.push(`Need at least ${MIN_PLAYERS} players`);

        for (const t of TEAMS) {
            const list = (rosterByTeam[t.id] || []);
            if (list.length > 3) issues.push(`Team ${t.name} has more than 3 players`);
            if (REQUIRE_FULL_TEAMS && list.length !== 3) issues.push(`Team ${t.name} must be exactly 3 players`);
        }
        if (REQUIRE_TEAM_FOR_ALL) {
            for (const p of players) if (!teamOf(p)) { issues.push('Everyone must join a team'); break; }
        }
        if (REQUIRE_ROLE_FOR_ALL) {
            for (const p of players) if (!roleOf(p)) { issues.push('Everyone must pick a role'); break; }
        }
        return issues;
    }, [players, rosterByTeam]);

    const canLaunch = launchIssues.length === 0;

    const onLaunch = useCallback((e) => {
        if (!iAmHost) return;
        const force = e?.altKey === true;
        if (!canLaunch && !force) {
            alert('Teams not ready:\n• ' + launchIssues.join('\n• '));
            return;
        }
        setRolesAssigned(false, true);
        setPhase('day', true);
        setTimer(dayLength, true);
    }, [iAmHost, canLaunch, launchIssues, setRolesAssigned, setPhase, setTimer, dayLength]);

    // ────────────────────────────────────────────────────────────────────────────
    // Render
    // ────────────────────────────────────────────────────────────────────────────
    return (
        <div style={styles.wrap}>
            <h1 style={styles.title}>Lobby</h1>

            <div style={styles.tabs}>
                <button onClick={() => setTab('team')} style={{ ...styles.tab, ...(tab === 'team' ? styles.tabActive : {}) }}>Team</button>
                <button onClick={() => setTab('launch')} style={{ ...styles.tab, ...(tab === 'launch' ? styles.tabActive : {}) }}>Launch</button>
            </div>

            {/* TEAM VIEW */}
            {tab === 'team' && (
                myTeam
                    ? <TeamLobby
                        team={TEAMS.find(t => t.id === myTeam)!}
                        players={players}
                        roster={rosterByTeam[myTeam] || []}
                        myId={myId}
                        myRole={myRole}
                        myIsLeader={myIsLeader}
                        iAmHost={iAmHost}
                        setRole={setRole}
                        leaveTeam={leaveTeam}
                        makeLeader={makeLeader}
                        canSeeRole={(target) => canSeeRole(me, target, iAmHost)}
                        copyLink={() => copyLink(myTeam)}
                        shareLink={() => shareLink(myTeam)}
                    />
                    : <TeamPicker
                        teams={TEAMS}
                        rosterByTeam={rosterByTeam}
                        attemptJoinTeam={attemptJoinTeam}
                    />
            )}

            {/* LAUNCH VIEW */}
            {tab === 'launch' && (
                <div style={styles.launchWrap}>
                    <div className="lobby-debug" style={{ fontSize: 12, opacity: .8, marginBottom: 8 }}>
                        Host: <b>{iAmHost ? 'yes' : 'no'}</b> • Phase: <b>{String(phase || 'lobby')}</b>
                        {launchIssues.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                                <div>Blocked by:</div>
                                <ul style={{ margin: '4px 0 0 16px' }}>
                                    {launchIssues.map((msg, i) => <li key={i}>{msg}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>

                    {iAmHost ? (
                        <>
                            <button
                                onClick={onLaunch}
                                disabled={!canLaunch}
                                title="Tip: hold Alt to force-launch (debug)."
                                style={{ ...styles.launchBtn, ...(canLaunch ? {} : styles.disabledBtn) }}
                            >
                                Launch Game
                            </button>
                            <div style={{ fontSize: 12, opacity: .7, marginTop: 8 }}>
                                Tip: Hold <kbd>Alt</kbd> while clicking to force launch (debug).
                            </div>
                        </>
                    ) : (
                        <div style={{ opacity: 0.8 }}>Waiting for host to launch…</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ──────────────────────────────────────────────────────────────────────────────
function TeamPicker({ teams, rosterByTeam, attemptJoinTeam }) {
    return (
        <div style={styles.partyGrid}>
            {teams.map(team => {
                const count = (rosterByTeam[team.id] || []).length;
                const full = count >= 3;
                return (
                    <div key={team.id} style={styles.teamCard}>
                        <div style={styles.teamHeader}>
                            <div>
                                <div style={styles.teamName}>{team.name}</div>
                                <div style={styles.teamSub}>{count}/3 players</div>
                            </div>
                            <div>
                                <button
                                    onClick={() => attemptJoinTeam(team.id)}
                                    disabled={full}
                                    style={{ ...styles.primaryBtn, ...(full ? styles.disabledBtn : {}) }}
                                >
                                    {full ? 'Full' : 'Join'}
                                </button>
                            </div>
                        </div>
                        {/* Privacy: when not in a team, we DON'T show any roster details or roles */}
                        <div style={{ fontSize: 12, opacity: .7 }}>
                            Choose this team to enter its private lobby.
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function TeamLobby({
    team, players, roster, myId, myRole, myIsLeader, iAmHost,
    setRole, leaveTeam, makeLeader, canSeeRole, copyLink, shareLink
}) {
    return (
        <div style={styles.teamLobby}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                    <div style={styles.teamName}>{team.name} — Team Lobby</div>
                    <div style={styles.teamSub}>{roster.length}/3 players</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={leaveTeam} style={styles.secondaryBtn}>Leave team</button>
                    {(myIsLeader || iAmHost) && (
                        <>
                            <button onClick={copyLink} style={styles.secondaryBtn}>Copy invite</button>
                            <button onClick={shareLink} style={styles.primaryBtn}>Share invite</button>
                        </>
                    )}
                </div>
            </div>

            {/* Private roster (visible only to this team / host) */}
            <div>
                {roster.map(p => {
                    const you = p.id === myId;
                    const name = getPlayerName(p);
                    const role = canSeeRole(p) ? (roleOf(p) || <span style={{ opacity: .6 }}>no role</span>)
                        : <span style={{ opacity: .6 }}>hidden</span>;
                    return (
                        <div key={p.id} style={styles.playerRow}>
                            <div style={styles.playerMain}>
                                <div style={styles.playerName}>
                                    {name} {you && <span style={styles.youBadge}>you</span>}
                                </div>
                                <div style={styles.roleText}>{role}</div>
                            </div>
                            {iAmHost && (
                                <button onClick={() => makeLeader(team.id, p.id)} style={styles.smallBtn} title="Make leader">
                                    Make Leader
                                </button>
                            )}
                        </div>
                    );
                })}

                {Array.from({ length: Math.max(0, 3 - roster.length) }).map((_, i) => (
                    <div key={`empty-${i}`} style={styles.emptySlot}>Empty slot</div>
                ))}
            </div>

            {/* Role picker for me */}
            <div style={styles.rolePicker}>
                <label style={styles.label}>Your Role</label>
                <select
                    value={myRole || ''}
                    onChange={(e) => setRole(e.target.value)}
                    style={styles.select}
                >
                    <option value="">Choose role…</option>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {myIsLeader && <div style={styles.leaderNote}>You are the team leader. Share the invite with your teammates.</div>}
            </div>

            {/* Privacy note */}
            {PRIVACY_HIDE_ROLES_CROSS_TEAM && (
                <div style={{ fontSize: 12, opacity: .7, marginTop: 8 }}>
                    Roles are private to your team{HOST_CAN_VIEW_ALL ? ' (host can view all)' : ''}.
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles (kept close to yours)
// ──────────────────────────────────────────────────────────────────────────────
const styles = {
    wrap: { maxWidth: 1100, margin: '24px auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui, Arial' },
    title: { fontSize: 28, fontWeight: 700, marginBottom: 12 },
    tabs: { display: 'flex', gap: 8, marginBottom: 16 },
    tab: { padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#f7f7f7', cursor: 'pointer' },
    tabActive: { background: '#111', color: '#fff', borderColor: '#111' },

    partyGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 },

    teamCard: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
    teamHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    teamName: { fontSize: 20, fontWeight: 700, lineHeight: 1 },
    teamSub: { fontSize: 12, opacity: 0.7 },

    teamLobby: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },

    playerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, border: '1px dashed #e5e7eb', marginBottom: 6 },
    playerMain: { display: 'flex', gap: 10, alignItems: 'center' },
    playerName: { fontWeight: 600 },
    youBadge: { marginLeft: 8, fontSize: 11, background: '#eef2ff', padding: '2px 6px', borderRadius: 999 },
    roleText: { fontSize: 13, opacity: 0.8 },
    emptySlot: { padding: '6px 8px', borderRadius: 10, background: '#fafafa', border: '1px dashed #eee', color: '#9ca3af', marginBottom: 6, fontStyle: 'italic' },

    rolePicker: { marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    label: { fontSize: 13, opacity: 0.8 },
    select: { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd' },
    leaderNote: { fontSize: 12, opacity: 0.8 },

    smallBtn: { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd', background: '#f7f7f7', cursor: 'pointer' },
    primaryBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid #111', background: '#111', color: '#fff', cursor: 'pointer' },
    secondaryBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' },
    disabledBtn: { opacity: 0.5, cursor: 'not-allowed' },

    inviteWrap: { marginTop: 12 },
    inviteGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 },
    inviteCard: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, background: '#fff' },
    inviteTitle: { fontWeight: 700, marginBottom: 6 },
    inviteLinkPreview: { fontSize: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 8, wordBreak: 'break-all' },
    inviteBtns: { display: 'flex', gap: 8 },

    launchWrap: { padding: 16 },
    launchBtn: { padding: '12px 16px', borderRadius: 12, border: '1px solid #0a0a0a', background: '#0a0a0a', color: '#fff', fontWeight: 700, cursor: 'pointer' },
};

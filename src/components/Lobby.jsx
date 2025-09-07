import React, { useMemo, useState, useCallback } from 'react';
import { myPlayer, usePlayersList, isHost } from 'playroomkit';
import { usePhase, useTimer, useLengths, useRolesAssigned } from '../network/playroom';

const TEAMS = [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
    { id: 'gamma', name: 'Gamma' },
    { id: 'delta', name: 'Delta' },
];

// Customize roles here
const ROLES = ['Engineer', 'Medic', 'Scientist', 'Scout', 'Technician', 'Pilot'];

// --- launch rules (flip as you like) ---
const REQUIRE_ROLE_FOR_ALL = true;  // everyone must pick a role before launch
const REQUIRE_TEAM_FOR_ALL = true;  // everyone must be in a team
const REQUIRE_FULL_TEAMS = false; // if true: each team must have exactly 3 players

// --- helpers to read/write simple per-player state safely ---
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
        else if (me.state) me.state[key] = value; // fallback (best-effort)
    } catch { }
}

function getPlayerName(p) {
    // prefer profile name if available
    return p?.getProfile?.().name || getPState(p, 'name', p?.name || `Player-${String(p?.id || '').slice(-4)}`);
}

function teamOf(p) {
    return getPState(p, 'team', null);
}
function roleOf(p) {
    return getPState(p, 'role', '');
}

// For simple “first joiner is leader” logic. Host can override.
function leaderIdForTeam(players, teamId) {
    const teamers = players.filter(p => teamOf(p) === teamId);
    if (teamers.length === 0) return null;
    const sorted = [...teamers].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const explicit = sorted.find(p => getPState(p, 'isLeader', false));
    return explicit ? explicit.id : sorted[0].id;
}

export default function Lobby() {
    const players = usePlayersList(true); // include self
    const iAmHost = isHost?.() ?? false;
    const [phase, setPhase] = usePhase();
    const [, setTimer] = useTimer();
    const { dayLength } = useLengths();
    const [, setRolesAssigned] = useRolesAssigned();
    const [tab, setTab] = useState('party');

    // ⏱️ control day start on launch + let App refill missing roles
    const [, setTimer] = useTimer();
    const { dayLength } = useLengths();
    const [, setRolesAssigned] = useRolesAssigned();

    // Parse team param from URL to auto-join when arriving via invite
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const invitedTeam = params.get('team');
        if (invitedTeam && TEAMS.some(t => t.id === invitedTeam)) {
            setTimeout(() => attemptJoinTeam(invitedTeam), 50);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const myId = myPlayer?.()?.id;
    const myTeam = useMemo(() => {
        const me = players.find(p => p.id === myId);
        return me ? teamOf(me) : null;
    }, [players, myId]);
    const myRole = useMemo(() => {
        const me = players.find(p => p.id === myId);
        return me ? roleOf(me) : '';
    }, [players, myId]);

    const attemptJoinTeam = useCallback((teamId) => {
        const current = rosterByTeam[teamId] || [];
        if (current.length >= 3) {
            alert(`Team ${teamId.toUpperCase()} is full (3/3).`);
            return false;
        }
        setMyState('team', teamId);
        if (myRole && current.some(p => roleOf(p) === myRole)) {
            // avoid duplicate if uniqueness enforced
            const taken = new Set(current.map(roleOf));
            const free = ROLES.find(r => !taken.has(r)) || '';
            setMyState('role', free);
        }
        return true;
    }, [rosterByTeam, myRole]);

    const leaveTeam = useCallback(() => {
        setMyState('team', null);
    }, []);

    const setRole = useCallback((newRole) => {
        // enforce unique roles per team (toggle off if you don't want this)
        if (myTeam) {
            const taken = new Set((rosterByTeam[myTeam] || []).map(roleOf));
            if (taken.has(newRole)) {
                alert(`Role "${newRole}" already taken in ${myTeam.toUpperCase()}.`);
                return;
            }
        }
        setMyState('role', newRole);
    }, [myTeam, rosterByTeam]);

    const makeLeader = useCallback((teamId, playerId) => {
        if (!isHost?.()) return;
        for (const p of players) {
            if (teamOf(p) === teamId) {
                if (p.id === playerId) {
                    p.setState?.('isLeader', true, true);
                } else {
                    p.setState?.('isLeader', false, true);
                }
            }
        }
    }, [players]);

    const myIsLeader = useMemo(() => {
        if (!myTeam) return false;
        const leadId = leaderIdForTeam(players, myTeam);
        return leadId === myId;
    }, [players, myTeam, myId]);

    const inviteLinkFor = useCallback((teamId) => {
        const url = new URL(window.location.href);
        url.searchParams.set('team', teamId);
        return url.toString();
    }, []);

    const copyLink = useCallback(async (teamId) => {
        const link = inviteLinkFor(teamId);
        try {
            await navigator.clipboard.writeText(link);
            alert(`Copied link for ${teamId.toUpperCase()}:\n${link}`);
        } catch {
            prompt(`Copy the link for ${teamId.toUpperCase()}:`, link);
        }
    }, [inviteLinkFor]);

    const shareLink = useCallback(async (teamId) => {
        const link = inviteLinkFor(teamId);
        if (navigator.share) {
            try {
                await navigator.share({ title: `Join ${teamId.toUpperCase()} Team`, url: link });
            } catch { /* no-op */ }
        } else {
            copyLink(teamId);
        }
    }, [inviteLinkFor, copyLink]);

    // 🔒 Launch requirements
    const canLaunch = useMemo(() => {
        if (players.length === 0) return false;

        for (const t of TEAMS) {
            const list = rosterByTeam[t.id] || [];
            if (list.length > 3) return false;               // hard cap
            if (REQUIRE_FULL_TEAMS && list.length !== 3) return false;
        }

        if (REQUIRE_TEAM_FOR_ALL) {
            for (const p of players) if (!teamOf(p)) return false;
        }
        if (REQUIRE_ROLE_FOR_ALL) {
            for (const p of players) if (!roleOf(p)) return false;
        }
        return true;
    }, [players, rosterByTeam]);

    const onLaunch = useCallback(() => {
        if (!iAmHost) return;
        if (!canLaunch) { alert('Teams not ready yet.'); return; }

        // Start game at Day 1 and allow App to fill any missing roles
        setRolesAssigned(false, true);
        setPhase('day', true);
        setTimer(dayLength, true);
    }, [iAmHost, canLaunch, setRolesAssigned, setPhase, setTimer, dayLength]);

    const showInviteTab = iAmHost || myIsLeader;

    return (
        <div style={styles.wrap}>
            <h1 style={styles.title}>Lobby</h1>

            <div style={styles.tabs}>
                {['party', 'invite', 'launch'].map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
                    >
                        {t === 'party' ? 'Party' : t === 'invite' ? 'Invite' : 'Launch'}
                    </button>
                ))}
            </div>

            {tab === 'party' && (
                <div style={styles.partyGrid}>
                    {TEAMS.map(team => {
                        const list = rosterByTeam[team.id] || [];
                        const leaderId = leaderIdForTeam(players, team.id);
                        const isMine = myTeam === team.id;
                        const canJoin = list.length < 3 || isMine;

                        return (
                            <div key={team.id} style={styles.teamCard}>
                                <div style={styles.teamHeader}>
                                    <div>
                                        <div style={styles.teamName}>{team.name}</div>
                                        <div style={styles.teamSub}>{list.length}/3 players</div>
                                    </div>
                                    <div>
                                        {isMine ? (
                                            <button onClick={leaveTeam} style={styles.secondaryBtn}>Leave</button>
                                        ) : (
                                            <button
                                                onClick={() => attemptJoinTeam(team.id)}
                                                disabled={!canJoin}
                                                style={{ ...styles.primaryBtn, ...(canJoin ? {} : styles.disabledBtn) }}
                                            >
                                                {list.length >= 3 ? 'Full' : 'Join'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    {list.map(p => (
                                        <div key={p.id} style={styles.playerRow}>
                                            <div style={styles.playerMain}>
                                                <div style={styles.playerName}>
                                                    {getPlayerName(p)} {p.id === leaderId && <span title="Leader" style={styles.leaderStar}>⭐</span>}
                                                    {p.id === myId && <span style={styles.youBadge}>you</span>}
                                                </div>
                                                <div style={styles.roleText}>
                                                    {roleOf(p) || <span style={{ opacity: 0.6 }}>no role</span>}
                                                </div>
                                            </div>

                                            {iAmHost && (
                                                <button
                                                    onClick={() => makeLeader(team.id, p.id)}
                                                    style={styles.smallBtn}
                                                    title="Make leader"
                                                >
                                                    Make Leader
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    {/* Empty slots */}
                                    {Array.from({ length: Math.max(0, 3 - list.length) }).map((_, i) => (
                                        <div key={`empty-${i}`} style={styles.emptySlot}>Empty slot</div>
                                    ))}
                                </div>

                                {isMine && (
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
                                        {myIsLeader && <div style={styles.leaderNote}>You are the team leader. Invite your teammates from the Invite tab.</div>}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {tab === 'invite' && (
                <div style={styles.inviteWrap}>
                    {showInviteTab ? (
                        <>
                            <p style={{ marginTop: 0 }}>
                                Leaders can share a team-specific link. Opening the link auto-selects that team.
                            </p>
                            <div style={styles.inviteGrid}>
                                {TEAMS.map(t => (
                                    <div key={t.id} style={styles.inviteCard}>
                                        <div style={styles.inviteTitle}>{t.name} Team Link</div>
                                        <div style={styles.inviteLinkPreview}>{inviteLinkFor(t.id)}</div>
                                        <div style={styles.inviteBtns}>
                                            <button onClick={() => copyLink(t.id)} style={styles.secondaryBtn}>Copy</button>
                                            <button onClick={() => shareLink(t.id)} style={styles.primaryBtn}>Share</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div style={{ opacity: 0.85 }}>Only your team leader (or host) can share invite links.</div>
                    )}
                </div>
            )}

            {tab === 'launch' && (
                <div style={styles.launchWrap}>
                    <div style={styles.readyRow}>
                        <span>Total players: <b>{players.length}</b></span>
                        {REQUIRE_FULL_TEAMS && <span style={{ marginLeft: 12, opacity: .8 }}>(requires 3/3 per team)</span>}
                    </div>
                    {iAmHost ? (
                        <button
                            onClick={onLaunch}
                            disabled={!canLaunch}
                            style={{ ...styles.launchBtn, ...(canLaunch ? {} : styles.disabledBtn) }}
                        >
                            Launch Game
                        </button>
                    ) : (
                        <div style={{ opacity: 0.8 }}>Waiting for host to launch…</div>
                    )}
                </div>
            )}
        </div>
    );
}

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

    playerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, border: '1px dashed #e5e7eb', marginBottom: 6 },
    playerMain: { display: 'flex', gap: 10, alignItems: 'center' },
    playerName: { fontWeight: 600 },
    leaderStar: { marginLeft: 6 },
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
    readyRow: { marginBottom: 12 },
    launchBtn: { padding: '12px 16px', borderRadius: 12, border: '1px solid #0a0a0a', background: '#0a0a0a', color: '#fff', fontWeight: 700, cursor: 'pointer' },
};

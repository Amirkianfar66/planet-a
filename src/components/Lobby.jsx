import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { myPlayer, usePlayersList, isHost } from 'playroomkit';
import {
    usePhase, useTimer, useLengths, useRolesAssigned, useInfectedAssigned,
    teamInviteUrl, waitForLocalPlayer, useLobbyRevealUntil
} from '../network/playroom';

const TEAMS = [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
    { id: 'gamma', name: 'Gamma' },
    { id: 'delta', name: 'Delta' },
];

const ROLES = ['Engineer', 'Research', 'StationDirector', 'Officer', 'Guard', 'FoodSupplier'];

// Launch rules
const MIN_PLAYERS = 2;
const REQUIRE_ROLE_FOR_ALL = true;
const REQUIRE_TEAM_FOR_ALL = true;
const REQUIRE_FULL_TEAMS = false;

// Steps
const STEP_START = 'start';
const STEP_JOIN = 'join';
const STEP_TEAM = 'team';

// --- helpers over Playroom state ---
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
    try { me.setState?.(key, value, true); } catch { }
}
function getPlayerName(p) {
    // ✅ Prefer the editable, network-synced name first
    const explicit = getPState(p, 'name', null);
    if (explicit && String(explicit).trim()) return String(explicit).trim();

    // fallback to Playroom profile name, then SDK name, then ID tail
    return p?.getProfile?.().name
        || p?.name
        || `Player-${String(p?.id || '').slice(-4)}`;
}

function teamOf(p) { return getPState(p, 'team', null); }
function roleOf(p) { return getPState(p, 'role', ''); }
function slotOf(p) { const s = getPState(p, 'slot', null); return (s === 0 || s === 1 || s === 2) ? s : null; }
function isInfected(p) { return !!getPState(p, 'infected', false); }

function leaderIdForTeam(players, teamId) {
    const teamers = players.filter(p => teamOf(p) === teamId);
    if (teamers.length === 0) return null;
    const sorted = [...teamers].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const explicit = sorted.find(p => getPState(p, 'isLeader', false));
    return explicit ? explicit.id : sorted[0].id;
}

export default function Lobby() {
    const players = usePlayersList(true);
    const iAmHost = isHost?.() ?? false;

    const [phase, setPhase] = usePhase();
    const [, setTimer] = useTimer();
    const { dayLength } = useLengths();
    const [, setRolesAssigned] = useRolesAssigned();
    const [, setInfectedAssigned] = useInfectedAssigned();
    const [revealUntil, setRevealUntil] = useLobbyRevealUntil();

    // small ticker so countdown updates
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 250);
        return () => clearInterval(id);
    }, []);
    const now = Date.now();
    const revealActive = Number(revealUntil) > now;
    const revealRemaining = Math.max(0, Math.ceil((Number(revealUntil) - now) / 1000));

    // UI flow
    const [step, setStep] = useState(STEP_START);
    const [showInvite, setShowInvite] = useState(false);

    // Local fallback so Team page renders immediately after we join/create
    const [clientMyTeam, setClientMyTeam] = useState(null);

    // Robust auto-join from links
    const [pendingTeamFromLink, setPendingTeamFromLink] = useState(null);
    const [linkTries, setLinkTries] = useState(0);

    // roster by team
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

    // me
    const myId = myPlayer?.()?.id;
    const me = players.find(p => p.id === myId);
    const myTeamFromPlayers = useMemo(() => (me ? teamOf(me) : null), [me]);
    const myRole = useMemo(() => (me ? roleOf(me) : ''), [me]);
    const mySlot = useMemo(() => (me ? slotOf(me) : null), [me]);

    // Use either the players list or our local fallback (define BEFORE using anywhere else)
    const myTeam = myTeamFromPlayers || clientMyTeam;

    // --- name editing (self only) ---
    const [nameDraft, setNameDraft] = useState('');
    const nameDebRef = useRef(null);

    // keep local draft in sync with network state when I change team or my state updates
    useEffect(() => {
        const current = me ? (me.getProfile?.().name || me.getState?.('name') || me.name || `Player-${String(me.id || '').slice(-4)}`) : '';
        setNameDraft(current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.id, myTeam]);

    const handleNameChange = useCallback((e) => {
        const v = (e.target.value || '').slice(0, 20); // limit length a bit
        setNameDraft(v);
        if (nameDebRef.current) clearTimeout(nameDebRef.current);
        nameDebRef.current = setTimeout(() => {
            const clean = v.trim() || `Player-${String(myId || '').slice(-4)}`;
            setMyState('name', clean); // broadcast to room
        }, 250); // debounce
    }, [myId]);

    // duplicate warning inside my team (compute AFTER myTeam exists)
    const nameClash = useMemo(() => {
        if (!myTeam) return false;
        const myLower = (nameDraft || '').trim().toLowerCase();
        if (!myLower) return false;
        return (rosterByTeam[myTeam] || [])
            .some(p => p.id !== myId && (getPlayerName(p) || '').trim().toLowerCase() === myLower);
    }, [nameDraft, myTeam, rosterByTeam, myId]);

    /* -------------------------------------------
       Read ?team= (or #team=) once -> store pending
    -------------------------------------------- */
    useEffect(() => {
        const pickTeam = (s) => {
            const q = new URLSearchParams(s);
            const t = q.get('team');
            return TEAMS.some(x => x.id === t) ? t : null;
        };
        const fromSearch = pickTeam(window.location.search);
        const fromHash = pickTeam(window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '');
        const invitedTeam = fromSearch || fromHash;
        if (invitedTeam) setPendingTeamFromLink(invitedTeam);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* -------------------------------------------
       Auto-join from link when myPlayer() exists
    -------------------------------------------- */
    useEffect(() => {
        if (!pendingTeamFromLink || myTeam) return;

        let cancelled = false;
        const tryJoin = async () => {
            const meNow = await waitForLocalPlayer();
            if (!meNow) { setLinkTries(n => n + 1); return false; }
            const ok = await attemptJoinTeam(pendingTeamFromLink);
            if (ok) {
                setPendingTeamFromLink(null);
                setLinkTries(0);
                setStep(STEP_TEAM);
                return true;
            }
            setLinkTries(n => n + 1);
            return false;
        };

        (async () => {
            if (cancelled) return;
            if (await tryJoin()) return;
            const id = setInterval(async () => {
                if (cancelled) { clearInterval(id); return; }
                if (linkTries > 50) { clearInterval(id); return; } // ~10s
                (await tryJoin()) && clearInterval(id);
            }, 200);
            return () => clearInterval(id);
        })();

        return () => { cancelled = true; };
    }, [pendingTeamFromLink, myTeam, linkTries]); // attemptJoinTeam defined below

    // --- actions ---
    const ensureMySlot = useCallback((teamId, preferred = null) => {
        const list = rosterByTeam[teamId] || [];
        const taken = new Set(list.map(slotOf).filter(s => s !== null));
        let target = preferred;
        if (target === null || taken.has(target)) {
            for (let i = 0; i < 3; i++) if (!taken.has(i)) { target = i; break; }
        }
        if (target === null) return false;
        setMyState('slot', target);
        return true;
    }, [rosterByTeam]);

    const attemptJoinTeam = useCallback(async (teamId) => {
        // ensure local player exists
        const meReady = await waitForLocalPlayer();
        if (!meReady) return false;

        const current = rosterByTeam[teamId] || [];
        if (current.length >= 3) {
            alert(`Team ${teamId.toUpperCase()} is full (3/3).`);
            return false;
        }

        setMyState('team', teamId);
        // local fallback so UI can render immediately
        setClientMyTeam(teamId);

        // seat me in first free slot
        ensureMySlot(teamId);

        // avoid duplicate role on join
        const takenRoles = new Set(current.map(roleOf));
        if (myRole && takenRoles.has(myRole)) {
            const free = ROLES.find(r => !takenRoles.has(r)) || '';
            setMyState('role', free);
        }

        // wait until the state shows up locally (up to ~2s)
        for (let i = 0; i < 40; i++) {
            if (myPlayer()?.getState?.('team') === teamId) break;
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 50));
        }

        // reflect chosen team in URL using the canonical builder (preserves ?r=)
        const url = teamInviteUrl(teamId);
        window.history.replaceState({}, '', url);

        return true;
    }, [rosterByTeam, myRole, ensureMySlot]);

    // Create team → prefer empty team, else any with room; seat me slot 0; mark leader
    const createTeam = useCallback(async () => {
        let target = TEAMS.find(t => (rosterByTeam[t.id] || []).length === 0)?.id;
        if (!target) target = TEAMS.find(t => (rosterByTeam[t.id] || []).length < 3)?.id;
        if (!target) { alert('All teams are full right now.'); return; }

        const ok = await attemptJoinTeam(target);
        if (!ok) return;

        // seat me at slot 0 if possible
        ensureMySlot(target, 0);

        // mark me as leader
        for (const p of players) {
            if (teamOf(p) === target) p.setState?.('isLeader', p.id === myId, true);
        }

        setShowInvite(false);
        setStep(STEP_TEAM);
    }, [players, rosterByTeam, attemptJoinTeam, ensureMySlot, myId]);

    const goJoin = useCallback(() => { setShowInvite(false); setStep(STEP_JOIN); }, []);
    const leaveTeam = useCallback(() => {
        setMyState('slot', null);
        setMyState('role', '');
        setMyState('team', null);
        setClientMyTeam(null);
        setShowInvite(false);
        setStep(STEP_START);
    }, []);

    const setRole = useCallback((newRole) => {
        if (myTeam) {
            const taken = new Set((rosterByTeam[myTeam] || []).map(roleOf));
            if (taken.has(newRole)) { alert(`Role "${newRole}" already taken in ${myTeam.toUpperCase()}.`); return; }
        }
        setMyState('role', newRole);
    }, [myTeam, rosterByTeam]);

    const makeLeader = useCallback((teamId, playerId) => {
        const leaderCan = isHost?.() || leaderIdForTeam(players, teamId) === myId;
        if (!leaderCan) return;
        for (const p of players) {
            if (teamOf(p) === teamId) p.setState?.('isLeader', p.id === playerId, true);
        }
    }, [players, myId]);

    const myLeaderId = useMemo(() => (myTeam ? leaderIdForTeam(players, myTeam) : null), [players, myTeam]);
    const myIsLeader = myLeaderId === myId;

    // Invite helpers
    const inviteLinkFor = useCallback((teamId) => teamInviteUrl(teamId), []);

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
    const canPressLaunch = iAmHost || myIsLeader;

    // ===== LAUNCH: assign infected, reveal in lobby (4s), then start Day 1 =====
    const onLaunch = useCallback((e) => {
        if (!canPressLaunch) return;
        const force = e?.altKey === true;
        if (!canLaunch && !force) {
            alert('Teams not ready:\n• ' + launchIssues.join('\n• '));
            return;
        }

        // 1) Assign one infected per team
        const byTeam = new Map();
        for (const p of players) {
            const t = teamOf(p);
            if (!t) continue;
            const arr = byTeam.get(t) || [];
            arr.push(p);
            byTeam.set(t, arr);
        }
        for (const [, arr] of byTeam.entries()) {
            if (arr.length < 1) continue;
            // clear old flags
            arr.forEach(pl => pl.setState?.('infected', false, true));
            // pick exactly one
            const pick = arr[Math.floor(Math.random() * arr.length)];
            pick.setState?.('infected', true, true);
        }

        // 2) Mark: roles/infections assigned, open reveal window
        setRolesAssigned(true, true);
        setInfectedAssigned(true, true);
        setRevealUntil(Date.now() + 4000, true); // 4s

        // 3) After reveal, start Day 1
        setTimeout(() => {
            setPhase('day', true);
            setTimer(dayLength, true);
        }, 4100);
    }, [canPressLaunch, canLaunch, launchIssues, players, setRolesAssigned, setInfectedAssigned, setRevealUntil, setPhase, setTimer, dayLength]);

    // ─────────── Render ───────────
    return (
        <div style={styles.wrap}>
            <h1 style={styles.title}>Lobby</h1>

            {step === STEP_START && (
                <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
                    <button onClick={createTeam} style={{ ...styles.bigBtn, background: '#0a0a0a', color: '#fff', borderColor: '#0a0a0a' }}>
                        Create a Team
                    </button>
                    <button onClick={goJoin} style={styles.bigBtn}>
                        Join a Team
                    </button>
                    <div style={{ opacity: .7, fontSize: 12 }}>
                        Host: <b>{iAmHost ? 'yes' : 'no'}</b> • Phase: <b>{String(phase || 'lobby')}</b>
                    </div>
                </div>
            )}

            {step === STEP_JOIN && (
                <div>
                    <button onClick={() => setStep(STEP_START)} style={styles.secondaryBtn}>&larr; Back</button>
                    <h3>Pick a Team to Join</h3>
                    <div style={styles.partyGrid}>
                        {TEAMS.map(team => {
                            const list = rosterByTeam[team.id] || [];
                            const count = list.length;
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
                                                onClick={async () => {
                                                    const ok = await attemptJoinTeam(team.id);
                                                    if (ok) setStep(STEP_TEAM);
                                                }}
                                                disabled={full || revealActive}
                                                style={{ ...styles.primaryBtn, ...((full || revealActive) ? styles.disabledBtn : {}) }}
                                            >
                                                {full ? 'Full' : 'Join'}
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        You’ll see the private team page after joining.
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {step === STEP_TEAM && myTeam && (
                <div style={styles.teamCard}>
                    <div style={styles.teamHeader}>
                        <div>
                            <div style={styles.teamName}>{TEAMS.find(t => t.id === myTeam)?.name} — Team</div>
                            <div style={styles.teamSub}>{(rosterByTeam[myTeam] || []).length}/3 players</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={leaveTeam} style={styles.secondaryBtn} disabled={revealActive}>Change Team</button>
                            <button onClick={() => setShowInvite(s => !s)} style={{ ...styles.primaryBtn, ...(revealActive ? styles.disabledBtn : {}) }}>
                                {showInvite ? 'Hide Invite' : 'Invite'}
                            </button>
                        </div>
                    </div>

                    {revealActive && (
                        <div style={styles.revealBanner}>
                            Infected reveal: <b>{revealRemaining}s</b> — watch for the red badges.
                        </div>
                    )}

                    {showInvite && (
                        <div style={{ ...styles.inviteCard, marginBottom: 10 }}>
                            <div style={styles.inviteTitle}>Share this link</div>
                            <div style={styles.inviteLinkPreview}>{inviteLinkFor(myTeam)}</div>
                            <div style={styles.inviteBtns}>
                                <button onClick={() => navigator.clipboard.writeText(inviteLinkFor(myTeam))} style={styles.secondaryBtn}>Copy</button>
                                <button onClick={() => {
                                    const link = inviteLinkFor(myTeam);
                                    if (navigator.share) navigator.share({ title: `Join ${myTeam.toUpperCase()} Team`, url: link }).catch(() => { });
                                    else navigator.clipboard.writeText(link);
                                }} style={styles.primaryBtn}>Share</button>
                            </div>
                        </div>
                    )}

                    {/* Ordered 3 slots, then extras */}
                    <div>
                        {(() => {
                            const list = rosterByTeam[myTeam] || [];
                            const slots = Array(3).fill(null);
                            const extras = [];
                            for (const p of list) {
                                const s = slotOf(p);
                                if (s !== null && s >= 0 && s < 3 && slots[s] === null) slots[s] = p;
                                else extras.push(p);
                            }
                            const leaderId = leaderIdForTeam(players, myTeam);
                            return (
                                <>
                                    {slots.map((p, i) => (
                                        p ? (
                                            <div key={p.id} style={{ ...styles.playerRow, ...(revealActive && isInfected(p) ? styles.infectedRow : {}) }}>
                                                <div style={styles.playerMain}>
                                                    <div style={styles.playerName}>
                                                        {getPlayerName(p)} {p.id === leaderId && <span title="Leader" style={styles.leaderStar}>⭐</span>}
                                                        {p.id === myId && <span style={styles.youBadge}>you</span>}
                                                    </div>
                                                    <div style={styles.roleText}>
                                                        {roleOf(p) || <span style={{ opacity: .6 }}>no role</span>}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    {revealActive && isInfected(p) && <span style={styles.infectedPill}>INFECTED</span>}
                                                    {(iAmHost || myIsLeader) && (
                                                        <button onClick={() => makeLeader(myTeam, p.id)} style={styles.smallBtn} title="Make leader" disabled={revealActive}>
                                                            Make Leader
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div key={`empty-${i}`} style={styles.emptySlot}>Empty slot</div>
                                        )
                                    ))}
                                    {extras.map(p => (
                                        <div key={p.id} style={{ ...styles.playerRow, ...(revealActive && isInfected(p) ? styles.infectedRow : {}) }}>
                                            <div style={styles.playerMain}>
                                                <div style={styles.playerName}>
                                                    {getPlayerName(p)} {p.id === leaderId && <span title="Leader" style={styles.leaderStar}>⭐</span>}
                                                    {p.id === myId && <span style={styles.youBadge}>you</span>}
                                                </div>
                                                <div style={styles.roleText}>{roleOf(p) || <span style={{ opacity: .6 }}>no role</span>}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                {revealActive && isInfected(p) && <span style={styles.infectedPill}>INFECTED</span>}
                                                {(iAmHost || myIsLeader) && <button onClick={() => makeLeader(myTeam, p.id)} style={styles.smallBtn} disabled={revealActive}>Make Leader</button>}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            );
                        })()}
                    </div>

                    {/* Your name (self-edit) */}
                    <div style={styles.nameEditRow}>
                        <label style={styles.label}>Your Name</label>
                        <input
                            type="text"
                            value={nameDraft}
                            onChange={handleNameChange}
                            maxLength={20}
                            placeholder="Enter your name"
                            style={styles.input}
                            disabled={revealActive}
                        />
                        {nameClash && (
                            <span style={styles.nameWarn}>name already used in team</span>
                        )}
                    </div>

                    {/* Your role */}
                    <div style={styles.rolePicker}>
                        <label style={styles.label}>Your Role</label>
                        <select
                            value={myRole || ''}
                            onChange={(e) => setRole(e.target.value)}
                            disabled={revealActive}
                            style={{ ...styles.select, ...(revealActive ? styles.disabledBtn : {}) }}
                        >
                            <option value="">Choose role…</option>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {/* Launch */}
                    <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 12, opacity: .8, marginBottom: 8 }}>
                            Host: <b>{iAmHost ? 'yes' : 'no'}</b> • Leader: <b>{myIsLeader ? 'yes' : 'no'}</b> • Phase: <b>{String(phase || 'lobby')}</b>
                            {launchIssues.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                    <div>Blocked by:</div>
                                    <ul style={{ margin: '4px 0 0 16px' }}>
                                        {launchIssues.map((msg, i) => <li key={i}>{msg}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={onLaunch}
                            disabled={!canPressLaunch || !canLaunch || revealActive}
                            title={canPressLaunch ? 'Launch → reveal infected (4s) → Day 1' : 'Only team leader or host can launch.'}
                            style={{ ...styles.launchBtn, ...((canPressLaunch && canLaunch && !revealActive) ? {} : styles.disabledBtn) }}
                        >
                            Launch Game
                        </button>
                    </div>
                </div>
            )}

            {step === STEP_TEAM && !myTeam && (
                <div style={{ opacity: .9 }}>
                    <div style={{ marginBottom: 8 }}>Creating your team…</div>
                    <div style={{ fontSize: 12 }}>
                        If this takes longer than a couple seconds, go{' '}
                        <button onClick={() => setStep(STEP_START)} style={{ ...styles.secondaryBtn, padding: '4px 8px' }}>Back</button>
                        {' '}and try again.
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    wrap: { maxWidth: 1100, margin: '24px auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui, Arial' },
    title: { fontSize: 28, fontWeight: 700, marginBottom: 12 },

    // start & join
    bigBtn: { padding: '14px 18px', borderRadius: 12, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16 },

    partyGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 },
    teamCard: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
    teamHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    teamName: { fontSize: 20, fontWeight: 700, lineHeight: 1 },
    teamSub: { fontSize: 12, opacity: 0.7 },

    playerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 10, border: '1px dashed #e5e7eb', marginBottom: 6 },
    infectedRow: { border: '1px solid #b91c1c', background: '#fff5f5' },
    infectedPill: { fontSize: 11, fontWeight: 700, color: '#fff', background: '#b91c1c', padding: '2px 8px', borderRadius: 999 },

    playerMain: { display: 'flex', gap: 10, alignItems: 'center' },
    playerName: { fontWeight: 600 },
    leaderStar: { marginLeft: 6 },
    youBadge: { marginLeft: 8, fontSize: 11, background: '#eef2ff', padding: '2px 6px', borderRadius: 999 },
    roleText: { fontSize: 13, opacity: 0.8 },
    emptySlot: { padding: '6px 8px', borderRadius: 10, background: '#fafafa', border: '1px dashed #eee', color: '#9ca3af', marginBottom: 6, fontStyle: 'italic' },

    // name editor
    nameEditRow: { margin: '8px 0 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    input: { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd', minWidth: 180 },
    nameWarn: { fontSize: 12, color: '#b91c1c' },

    rolePicker: { marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    label: { fontSize: 13, opacity: 0.8 },
    select: { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd' },

    inviteCard: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 12, background: '#fff' },
    inviteTitle: { fontWeight: 700, marginBottom: 6 },
    inviteLinkPreview: { fontSize: 12, background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 8, wordBreak: 'break-all' },
    inviteBtns: { display: 'flex', gap: 8 },

    primaryBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid #111', background: '#111', color: '#fff', cursor: 'pointer' },
    secondaryBtn: { padding: '8px 12px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' },
    smallBtn: { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd', background: '#f7f7f7', cursor: 'pointer' },
    disabledBtn: { opacity: 0.5, cursor: 'not-allowed' },

    launchBtn: { padding: '12px 16px', borderRadius: 12, border: '1px solid #0a0a0a', background: '#0a0a0a', color: '#fff', fontWeight: 700, cursor: 'pointer' },

    revealBanner: {
        padding: '6px 10px',
        marginBottom: 10,
        borderRadius: 10,
        background: '#fff5f5',
        border: '1px solid #fecaca',
        color: '#7f1d1d',
        fontSize: 12
    },
};

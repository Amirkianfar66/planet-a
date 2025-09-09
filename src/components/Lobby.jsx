// src/components/Lobby.jsx
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { myPlayer, usePlayersList, isHost } from "playroomkit";
import { useGameState } from "../game/GameStateProvider";

const TEAMS = [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
    { id: "gamma", name: "Gamma" },
    { id: "delta", name: "Delta" },
];

const ROLES = ["Engineer", "Research", "StationDirector", "Officer", "Guard", "FoodSupplier"];

const REQUIRE_ROLE_FOR_ALL = true;
const REQUIRE_TEAM_FOR_ALL = true;
const REQUIRE_FULL_TEAMS = false;

function getPState(p, key, fallback = undefined) {
    try {
        if (p?.state && key in p.state) return p.state[key];
        if (typeof p?.getState === "function") return p.getState(key) ?? fallback;
    } catch { }
    return fallback;
}
function setMyState(key, value) {
    const me = myPlayer?.();
    if (!me) return;
    try {
        if (typeof me.setState === "function") me.setState(key, value, true);
        else if (me.state) me.state[key] = value;
    } catch { }
}
function getPlayerName(p) {
    return p?.getProfile?.().name || getPState(p, "name", p?.name || `Player-${String(p?.id || "").slice(-4)}`);
}
const teamOf = (p) => getPState(p, "team", null);
const roleOf = (p) => getPState(p, "role", "");

function leaderIdForTeam(players, teamId) {
    const teamers = players.filter((p) => teamOf(p) === teamId);
    if (teamers.length === 0) return null;
    const sorted = [...teamers].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const explicit = sorted.find((p) => getPState(p, "isLeader", false));
    return explicit ? explicit.id : sorted[0].id;
}

export default function Lobby() {
    const players = usePlayersList(); // presence-only (includes self)
    const iAmHost = isHost?.() ?? false;

    // read/write room state from provider (no extra listeners)
    const {
        phase, setPhase,
        setTimer,
        dayLength,
        setRolesAssigned,
    } = useGameState();

    const [tab, setTab] = useState("party");

    // auto-join team via ?team= param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const invitedTeam = params.get("team");
        if (invitedTeam && TEAMS.some((t) => t.id === invitedTeam)) {
            setTimeout(() => attemptJoinTeam(invitedTeam), 50);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rosterByTeam = useMemo(() => {
        const map = Object.fromEntries(TEAMS.map((t) => [t.id, []]));
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
        const me = players.find((p) => p.id === myId);
        return me ? teamOf(me) : null;
    }, [players, myId]);
    const myRole = useMemo(() => {
        const me = players.find((p) => p.id === myId);
        return me ? roleOf(me) : "";
    }, [players, myId]);

    const attemptJoinTeam = useCallback(
        (teamId) => {
            const current = rosterByTeam[teamId] || [];
            if (current.length >= 3) {
                alert(`Team ${teamId.toUpperCase()} is full (3/3).`);
                return false;
            }
            setMyState("team", teamId);
            if (myRole && current.some((p) => roleOf(p) === myRole)) {
                const taken = new Set(current.map(roleOf));
                const free = ROLES.find((r) => !taken.has(r)) || "";
                setMyState("role", free);
            }
            return true;
        },
        [rosterByTeam, myRole]
    );

    const leaveTeam = useCallback(() => setMyState("team", null), []);

    const setRole = useCallback(
        (newRole) => {
            if (myTeam) {
                const taken = new Set((rosterByTeam[myTeam] || []).map(roleOf));
                if (taken.has(newRole)) {
                    alert(`Role "${newRole}" already taken in ${myTeam.toUpperCase()}.`);
                    return;
                }
            }
            setMyState("role", newRole);
        },
        [myTeam, rosterByTeam]
    );

    const makeLeader = useCallback(
        (teamId, playerId) => {
            if (!isHost?.()) return;
            for (const p of players) {
                if (teamOf(p) === teamId) {
                    p.setState?.("isLeader", p.id === playerId, true);
                }
            }
        },
        [players]
    );

    const myIsLeader = useMemo(() => {
        if (!myTeam) return false;
        const leadId = leaderIdForTeam(players, myTeam);
        return leadId === myId;
    }, [players, myTeam, myId]);

    const inviteLinkFor = useCallback((teamId) => {
        const url = new URL(window.location.href);
        url.searchParams.set("team", teamId);
        return url.toString();
    }, []);
    const copyLink = useCallback(
        async (teamId) => {
            const link = inviteLinkFor(teamId);
            try {
                await navigator.clipboard.writeText(link);
                alert(`Copied link for ${teamId.toUpperCase()}:\n${link}`);
            } catch {
                prompt(`Copy the link for ${teamId.toUpperCase()}:`, link);
            }
        },
        [inviteLinkFor]
    );
    const shareLink = useCallback(
        async (teamId) => {
            const link = inviteLinkFor(teamId);
            if (navigator.share) {
                try {
                    await navigator.share({ title: `Join ${teamId.toUpperCase()} Team`, url: link });
                } catch { }
            } else {
                copyLink(teamId);
            }
        },
        [inviteLinkFor, copyLink]
    );

    const launchIssues = useMemo(() => {
        const issues = [];
        if (players.length === 0) issues.push("No players connected");

        for (const t of TEAMS) {
            const list = rosterByTeam[t.id] || [];
            if (list.length > 3) issues.push(`Team ${t.name} has more than 3 players`);
            if (REQUIRE_FULL_TEAMS && list.length !== 3) issues.push(`Team ${t.name} must be exactly 3 players`);
        }

        if (REQUIRE_TEAM_FOR_ALL) {
            for (const p of players) if (!teamOf(p)) { issues.push("Everyone must join a team"); break; }
        }
        if (REQUIRE_ROLE_FOR_ALL) {
            for (const p of players) if (!roleOf(p)) { issues.push("Everyone must pick a role"); break; }
        }
        return issues;
    }, [players, rosterByTeam]);

    const canLaunch = launchIssues.length === 0;

    const onLaunch = useCallback(
        (e) => {
            if (!iAmHost) return;
            const force = e?.altKey === true;
            if (!canLaunch && !force) {
                alert("Teams not ready:\n• " + launchIssues.join("\n• "));
                return;
            }
            // Start Day 1 and let the game assign anything missing
            setRolesAssigned(false, true);
            setPhase("day", true);
            setTimer(dayLength, true);
        },
        [iAmHost, canLaunch, launchIssues, setRolesAssigned, setPhase, setTimer, dayLength]
    );

    const showInviteTab = iAmHost || myIsLeader;

    return (
        <div style={styles.wrap}>
            <h1 style={styles.title}>Lobby</h1>

            <div style={styles.tabs}>
                {["party", "invite", "launch"].map((t) => (
                    <button key={t} onClick={() => setTab(t)} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}>
                        {t === "party" ? "Party" : t === "invite" ? "Invite" : "Launch"}
                    </button>
                ))}
            </div>

            {/* PARTY TAB */}
            {tab === "party" && (
                <div style={styles.partyGrid}>
                    {TEAMS.map((team) => {
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
                                                {list.length >= 3 ? "Full" : "Join"}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    {list.map((p) => (
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
                                                <button onClick={() => makeLeader(team.id, p.id)} style={styles.smallBtn} title="Make leader">
                                                    Make Leader
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    {Array.from({ length: Math.max(0, 3 - list.length) }).map((_, i) => (
                                        <div key={`empty-${i}`} style={styles.emptySlot}>Empty slot</div>
                                    ))}
                                </div>

                                {isMine && (
                                    <div style={styles.rolePicker}>
                                        <label style={styles.label}>Your Role</label>
                                        <select value={myRole || ""} onChange={(e) => setRole(e.target.value)} style={styles.select}>
                                            <option value="">Choose role…</option>
                                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                        {myIsLeader && (
                                            <div style={styles.leaderNote}>
                                                You are the team leader. Invite your teammates from the Invite tab.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* INVITE TAB */}
            {tab === "invite" && (
                <div style={styles.inviteWrap}>
                    {showInviteTab ? (
                        <>
                            <p style={{ marginTop: 0 }}>
                                Leaders can share a team-specific link. Opening the link auto-selects that team.
                            </p>
                            <div style={styles.inviteGrid}>
                                {TEAMS.map((t) => (
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

            {/* LAUNCH TAB */}
            {tab === "launch" && (
                <div style={styles.launchWrap}>
                    <div className="lobby-debug" style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                        Host: <b>{iAmHost ? "yes" : "no"}</b> • Phase: <b>{String(phase || "lobby")}</b>
                        {launchIssues.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                                <div>Blocked by:</div>
                                <ul style={{ margin: "4px 0 0 16px" }}>
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
                            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
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

const styles = { /* … keep your styles unchanged … */ };

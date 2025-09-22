// src/voice/ProximityVoice.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import { usePhase } from "../network/playroom"; // optional: widen range in meetings

const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478?transport=udp" },
    ],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
};

export default function ProximityVoice({
    radius = 7,                 // meters
    falloff = "smooth",         // "smooth" | "linear"
    globalDuringMeeting = true, // optionally ignore distance during meetings
}) {
    const players = usePlayersList(true);
    const me = myPlayer();
    const [phase] = usePhase();

    // UI state
    const [enabled, setEnabled] = useState(false); // mic permission obtained
    const [muted, setMuted] = useState(false);     // local mute toggle
    const [ptt, setPTT] = useState(false);         // push-to-talk (hold V)

    // Media / connections
    const localStreamRef = useRef(null);
    const pcsRef = useRef(new Map());     // peerId -> RTCPeerConnection
    const audiosRef = useRef(new Map());  // peerId -> HTMLAudioElement
    const seenSigRef = useRef({});        // de-dupe signaling blobs

    // Helper: get my current world position (poll like other systems do)
    const myPos = () => {
        const p = myPlayer();
        return {
            x: Number(p?.getState?.("x") || 0),
            z: Number(p?.getState?.("z") || 0),
        };
    };

    // --- UI + mic capture ---
    const ensureMic = async () => {
        if (localStreamRef.current) return localStreamRef.current;
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: false,
        });
        localStreamRef.current = stream;
        setEnabled(true);
        return stream;
    };

    // Push-to-talk (hold V)
    useEffect(() => {
        const down = (e) => {
            if ((e.code || e.key) === "KeyV") setPTT(true);
            if ((e.code || e.key) === "KeyM") setMuted((m) => !m);
        };
        const up = (e) => { if ((e.code || e.key) === "KeyV") setPTT(false); };
        window.addEventListener("keydown", down, { passive: true });
        window.addEventListener("keyup", up, { passive: true });
        return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    }, []);

    // Keep local track enabled/disabled based on mute/PTT
    useEffect(() => {
        const stream = localStreamRef.current;
        if (!stream) return;
        const talking = !muted && (ptt || !ptt); // if you want "always-on", set to !muted
        for (const track of stream.getAudioTracks()) {
            // choose PTT semantics: enable only while holding V
            track.enabled = !muted && (ptt ? ptt : true);
        }
    }, [muted, ptt]);

    // --- Signaling helpers (using per-player state as the bus) ---
    const setMySig = (key, data) => {
        try { me?.setState?.(key, JSON.stringify(data), true); } catch { }
    };
    const getSig = (p, key) => {
        try {
            const raw = p?.getState?.(key);
            if (!raw) return null;
            if (seenSigRef.current[`${p.id}:${key}`] === raw) return null;
            seenSigRef.current[`${p.id}:${key}`] = raw;
            return JSON.parse(raw);
        } catch { return null; }
    };

    // Create + register a peer connection toward a target
    const getOrCreatePC = async (targetId) => {
        let pc = pcsRef.current.get(targetId);
        if (pc) return pc;

        pc = new RTCPeerConnection(RTC_CONFIG);

        // Play incoming audio
        pc.ontrack = (ev) => {
            let audio = audiosRef.current.get(targetId);
            if (!audio) {
                audio = document.createElement("audio");
                audio.autoplay = true;
                audio.playsInline = true;
                audio.style.display = "none";
                document.body.appendChild(audio);
                audiosRef.current.set(targetId, audio);
            }
            audio.srcObject = ev.streams[0];
            audio.volume = 0; // will be set by proximity loop
        };

        // Trickle ICE to target
        pc.onicecandidate = (ev) => {
            if (!ev.candidate) return;
            const msg = {
                from: me?.id, to: targetId, type: "ice", candidate: ev.candidate, ts: Date.now(),
            };
            setMySig(`voip_ice_to_${targetId}`, msg);
        };

        // Add my mic
        const stream = await ensureMic();
        for (const track of stream.getAudioTracks()) {
            pc.addTrack(track, stream);
        }

        pcsRef.current.set(targetId, pc);
        return pc;
    };

    // Outgoing offers to everyone (on first enable or when new players join)
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;

        (async () => {
            for (const p of players) {
                if (!me || p.id === me.id) continue;
                const pc = await getOrCreatePC(p.id);

                // Only offer if we don't have a connection yet
                if (pc.signalingState === "stable" && !pc.localDescription) {
                    try {
                        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
                        await pc.setLocalDescription(offer);
                        setMySig(`voip_offer_to_${p.id}`, { from: me.id, to: p.id, sdp: offer.sdp, type: offer.type, ts: Date.now() });
                    } catch (e) {
                        console.warn("[VOIP] offer failed:", e);
                    }
                }
            }
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, players.length]);

    // Signaling poll loop: handle offers to me, answers to my offers, and ICE
    useEffect(() => {
        let t;
        const tick = async () => {
            try {
                for (const p of players) {
                    if (!me || p.id === me.id) continue;

                    // 1) If someone sent me an offer -> create answer
                    const offer = getSig(p, `voip_offer_to_${me.id}`);
                    if (offer && offer.sdp) {
                        const pc = await getOrCreatePC(p.id);
                        try {
                            if (pc.signalingState === "stable") {
                                await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
                                const ans = await pc.createAnswer();
                                await pc.setLocalDescription(ans);
                                setMySig(`voip_answer_to_${p.id}`, { from: me.id, to: p.id, sdp: ans.sdp, type: ans.type, ts: Date.now() });
                            }
                        } catch (e) { /* ignore repeated/in-flight */ }
                    }

                    // 2) If they answered my offer -> setRemoteDescription
                    const answer = getSig(p, `voip_answer_to_${me.id}`);
                    if (answer && answer.sdp) {
                        const pc = await getOrCreatePC(p.id);
                        if (!pc.currentRemoteDescription) {
                            try { await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp }); } catch { }
                        }
                    }

                    // 3) ICE destined to me -> addCandidate
                    const ice = getSig(p, `voip_ice_to_${me.id}`);
                    if (ice && ice.candidate && ice.candidate.candidate) {
                        const pc = await getOrCreatePC(p.id);
                        try { await pc.addIceCandidate(ice.candidate); } catch { }
                    }
                }
            } finally {
                t = setTimeout(tick, 250); // light polling (similar to other state refresh loops)
            }
        };
        tick();
        return () => clearTimeout(t);
    }, [players, me]);

    // Disconnect + cleanup when peers leave
    useEffect(() => {
        const liveIds = new Set(players.map(p => p.id));
        for (const [peerId, pc] of pcsRef.current.entries()) {
            if (!liveIds.has(peerId)) {
                try { pc.close(); } catch { }
                pcsRef.current.delete(peerId);
            }
        }
        for (const [peerId, el] of audiosRef.current.entries()) {
            if (!liveIds.has(peerId)) {
                try { el.remove(); } catch { }
                audiosRef.current.delete(peerId);
            }
        }
    }, [players]);

    // Proximity volume loop
    useEffect(() => {
        let raf;
        const loop = () => {
            const meP = myPos();
            const r = (globalDuringMeeting && String(phase) === "meeting") ? 1e9 : radius;
            const r2 = r * r;

            for (const p of players) {
                if (!me || p.id === me.id) continue;
                const audio = audiosRef.current.get(p.id);
                if (!audio) continue;

                // speaker position (the remote player's current pos)
                const px = Number(p.getState?.("x") || 0);
                const pz = Number(p.getState?.("z") || 0);

                const d2 = dist2(meP.x, meP.z, px, pz);
                let vol = 0;
                if (d2 < r2) {
                    const d = Math.sqrt(d2);
                    if (falloff === "linear") vol = clamp(1 - d / r, 0, 1);
                    else /* smooth */        vol = clamp(1 - (d / r) ** 2, 0, 1);
                }

                // hard mute beats proximity
                audio.volume = (enabled && !muted) ? vol : 0;
            }

            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [players, enabled, muted, radius, falloff, phase, globalDuringMeeting]);

    // Teardown on unmount
    useEffect(() => {
        return () => {
            for (const [, pc] of pcsRef.current) { try { pc.close(); } catch { } }
            pcsRef.current.clear();
            for (const [, el] of audiosRef.current) { try { el.remove(); } catch { } }
            audiosRef.current.clear();
            const s = localStreamRef.current;
            if (s) { s.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        };
    }, []);

    // Tiny floating UI
    return (
        <div style={{
            position: "absolute", left: 16, top: 16, zIndex: 10000,
            display: "flex", gap: 8, alignItems: "center",
            background: "rgba(14,17,22,0.9)", color: "#e5efff",
            border: "1px solid #2a3242", borderRadius: 10, padding: "6px 8px",
            fontFamily: "ui-sans-serif", fontSize: 12, pointerEvents: "auto"
        }}>
            {!enabled ? (
                <button
                    onClick={ensureMic}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #41506b", cursor: "pointer" }}
                    title="Grant microphone access to enable proximity voice"
                >
                    🎙️ Enable Voice
                </button>
            ) : (
                <>
                    <span style={{ opacity: 0.85 }}>🎙️ Voice:</span>
                    <button
                        onClick={() => setMuted(m => !m)}
                        className="item-btn"
                        style={{ padding: "4px 8px" }}
                        title="Toggle mute (M). Hold V for Push-To-Talk."
                    >
                        {muted ? "Muted (M)" : "Live (M)"}
                    </button>
                    <span style={{ opacity: 0.8 }}>Radius: {radius}m</span>
                    <span style={{ opacity: 0.6 }}>Hold <b>V</b> to talk</span>
                </>
            )}
        </div>
    );
}

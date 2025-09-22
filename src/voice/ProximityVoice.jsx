// src/voice/ProximityVoice.jsx
import React, { useEffect, useRef, useState } from "react";
import { myPlayer, usePlayersList } from "playroomkit";
import { usePhase } from "../network/playroom"; // optional meeting-phase integration

// Public STUNs are enough to start. You can add your own TURN here later.
const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478?transport=udp" },
    ],
};

// Player state keys
const TALK_KEY = "isTalking";
const MUTE_KEY = "isMuted"; // (not required by indicators, but handy to expose)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
};

export default function ProximityVoice({
    radius = 7,                 // hearing radius in meters
    falloff = "smooth",         // "smooth" | "linear"
    globalDuringMeeting = true, // if true, ignore distance in meeting phase
    pushToTalk = true,          // hold V to speak
}) {
    const players = usePlayersList(true);
    const me = myPlayer();
    const [phase] = usePhase();

    // UI state
    const [enabled, setEnabled] = useState(false); // mic permission granted
    const [muted, setMuted] = useState(false);     // local mute toggle
    const [ptt, setPTT] = useState(false);         // Push-To-Talk (hold V)

    // Media + RTC refs
    const localStreamRef = useRef(null);
    const pcsRef = useRef(new Map());     // peerId -> RTCPeerConnection
    const audiosRef = useRef(new Map());  // peerId -> HTMLAudioElement
    const seenSigRef = useRef({});        // de-dupe signaling payloads

    // Web Audio for basic VAD (voice activity detection)
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const vadBufRef = useRef(new Float32Array(2048));
    const lastTalkSendRef = useRef(0);
    const lastTalkStateRef = useRef(false);

    // Helper: my current world position (as synced by your movement system)
    const myPos = () => {
        const p = myPlayer();
        return {
            x: Number(p?.getState?.("x") || 0),
            z: Number(p?.getState?.("z") || 0),
        };
    };

    /* ------------------ Mic capture ------------------ */
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

        // Minimal WebAudio analyser for RMS-based VAD
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const src = audioCtxRef.current.createMediaStreamSource(stream);
            const analyser = audioCtxRef.current.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.7;
            src.connect(analyser);
            analyserRef.current = analyser;
        } catch {
            // Ignore if AudioContext fails (Safari autoplay policies etc.)
        }

        // Publish initial mute state
        try { me?.setState?.(MUTE_KEY, 0, true); } catch { }
        return stream;
    };

    // PTT + mute key handlers
    useEffect(() => {
        const down = (e) => {
            const code = e.code || e.key;
            if (code === "KeyV") setPTT(true);
            if (code === "KeyM") {
                setMuted((m) => {
                    const next = !m;
                    try { me?.setState?.(MUTE_KEY, next ? 1 : 0, true); } catch { }
                    return next;
                });
            }
        };
        const up = (e) => {
            const code = e.code || e.key;
            if (code === "KeyV") setPTT(false);
        };
        window.addEventListener("keydown", down, { passive: true });
        window.addEventListener("keyup", up, { passive: true });
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, [me]);

    // Keep local audio tracks enabled/disabled based on mute/PTT
    useEffect(() => {
        const stream = localStreamRef.current;
        if (!stream) return;

        const shouldSend =
            !muted && (pushToTalk ? ptt : true); // open-mic if pushToTalk=false

        for (const track of stream.getAudioTracks()) {
            track.enabled = shouldSend;
        }
    }, [muted, ptt, pushToTalk]);

    // Clear flags on unmount
    useEffect(() => {
        return () => {
            try { me?.setState?.(TALK_KEY, 0, true); } catch { }
            try { me?.setState?.(MUTE_KEY, 0, true); } catch { }
        };
    }, [me]);

    /* ------------------ VAD: publish TALK_KEY ------------------ */
    useEffect(() => {
        let raf;
        const loop = () => {
            const analyser = analyserRef.current;
            const stream = localStreamRef.current;
            const now = Date.now();
            let talking = false;

            if (enabled && !muted && stream && analyser) {
                const buf = vadBufRef.current;
                analyser.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const rms = Math.sqrt(sum / buf.length);
                // Threshold tuned for speech; adjust 0.03–0.06 as needed
                talking = rms > 0.035 && (!pushToTalk || ptt);
            }

            const changed = talking !== lastTalkStateRef.current;
            if (changed || now - lastTalkSendRef.current > 2000) {
                try { me?.setState?.(TALK_KEY, talking ? 1 : 0, true); } catch { }
                lastTalkSendRef.current = now;
                lastTalkStateRef.current = talking;
            }

            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [enabled, muted, ptt, pushToTalk, me]);

    /* ------------------ Signaling helpers ------------------ */
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
        } catch {
            return null;
        }
    };

    const getOrCreatePC = async (targetId) => {
        let pc = pcsRef.current.get(targetId);
        if (pc) return pc;

        pc = new RTCPeerConnection(RTC_CONFIG);

        // Incoming audio -> <audio>
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
            audio.volume = 0; // set by proximity loop
        };

        // Trickle ICE to peer
        pc.onicecandidate = (ev) => {
            if (!ev.candidate) return;
            const msg = { from: me?.id, to: targetId, type: "ice", candidate: ev.candidate, ts: Date.now() };
            setMySig(`voip_ice_to_${targetId}`, msg);
        };

        // Add my mic track
        const stream = await ensureMic();
        for (const track of stream.getAudioTracks()) {
            pc.addTrack(track, stream);
        }

        pcsRef.current.set(targetId, pc);
        return pc;
    };

    // Offer to all others once enabled / when players change
    useEffect(() => {
        if (!enabled) return;
        (async () => {
            for (const p of players) {
                if (!me || p.id === me.id) continue;
                const pc = await getOrCreatePC(p.id);
                if (pc.signalingState === "stable" && !pc.localDescription) {
                    try {
                        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
                        await pc.setLocalDescription(offer);
                        setMySig(`voip_offer_to_${p.id}`, {
                            from: me.id, to: p.id, sdp: offer.sdp, type: offer.type, ts: Date.now(),
                        });
                    } catch (e) {
                        // ignore transient failures
                    }
                }
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, players.length]);

    // Handle incoming offers/answers/ICE (light polling)
    useEffect(() => {
        let t;
        const tick = async () => {
            try {
                for (const p of players) {
                    if (!me || p.id === me.id) continue;

                    // 1) Offers to me -> answer
                    const offer = getSig(p, `voip_offer_to_${me.id}`);
                    if (offer && offer.sdp) {
                        const pc = await getOrCreatePC(p.id);
                        try {
                            if (pc.signalingState === "stable") {
                                await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
                                const ans = await pc.createAnswer();
                                await pc.setLocalDescription(ans);
                                setMySig(`voip_answer_to_${p.id}`, {
                                    from: me.id, to: p.id, sdp: ans.sdp, type: ans.type, ts: Date.now(),
                                });
                            }
                        } catch {
                            // ignore repeated/in-flight
                        }
                    }

                    // 2) Answers to my offers
                    const answer = getSig(p, `voip_answer_to_${me.id}`);
                    if (answer && answer.sdp) {
                        const pc = await getOrCreatePC(p.id);
                        if (!pc.currentRemoteDescription) {
                            try { await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp }); } catch { }
                        }
                    }

                    // 3) ICE to me
                    const ice = getSig(p, `voip_ice_to_${me.id}`);
                    if (ice && ice.candidate && ice.candidate.candidate) {
                        const pc = await getOrCreatePC(p.id);
                        try { await pc.addIceCandidate(ice.candidate); } catch { }
                    }
                }
            } finally {
                t = setTimeout(tick, 250);
            }
        };
        tick();
        return () => clearTimeout(t);
    }, [players, me]);

    // Cleanup when peers leave
    useEffect(() => {
        const liveIds = new Set(players.map((p) => p.id));
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

    /* ------------------ Proximity volume loop ------------------ */
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

                const px = Number(p.getState?.("x") || 0);
                const pz = Number(p.getState?.("z") || 0);

                const d2 = dist2(meP.x, meP.z, px, pz);
                let vol = 0;
                if (d2 < r2) {
                    const d = Math.sqrt(d2);
                    if (falloff === "linear") vol = clamp(1 - d / r, 0, 1);
                    else /* smooth */        vol = clamp(1 - (d / r) ** 2, 0, 1);
                }

                // Do not honor the speaker's mute—mute only affects sending. This is listener-side gating.
                audio.volume = (enabled && !muted) ? vol : 0;
            }

            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [players, enabled, muted, radius, falloff, phase, globalDuringMeeting]);

    /* ------------------ Teardown ------------------ */
    useEffect(() => {
        return () => {
            for (const [, pc] of pcsRef.current) { try { pc.close(); } catch { } }
            pcsRef.current.clear();

            for (const [, el] of audiosRef.current) { try { el.remove(); } catch { } }
            audiosRef.current.clear();

            const s = localStreamRef.current;
            if (s) { s.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }

            if (audioCtxRef.current) {
                try { audioCtxRef.current.close(); } catch { }
                audioCtxRef.current = null;
                analyserRef.current = null;
            }

            try { me?.setState?.(TALK_KEY, 0, true); } catch { }
            try { me?.setState?.(MUTE_KEY, 0, true); } catch { }
        };
    }, [me]);

    /* ------------------ Tiny overlay UI ------------------ */
    return (
        <div
            style={{
                position: "absolute",
                left: 16,
                top: 16,
                zIndex: 10000,
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: "rgba(14,17,22,0.9)",
                color: "#e5efff",
                border: "1px solid #2a3242",
                borderRadius: 10,
                padding: "6px 8px",
                fontFamily: "ui-sans-serif",
                fontSize: 12,
                pointerEvents: "auto",
            }}
        >
            {!enabled ? (
                <button
                    onClick={ensureMic}
                    style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #41506b",
                        background: "#101722",
                        color: "#cfe3ff",
                        cursor: "pointer",
                    }}
                    title="Grant microphone access to enable proximity voice"
                >
                    🎙️ Enable Voice
                </button>
            ) : (
                <>
                    <span style={{ opacity: 0.85 }}>🎙️ Voice</span>
                    <button
                        onClick={() => {
                            const next = !muted;
                            setMuted(next);
                            try { me?.setState?.(MUTE_KEY, next ? 1 : 0, true); } catch { }
                        }}
                        style={{
                            padding: "4px 8px",
                            borderRadius: 8,
                            border: "1px solid #41506b",
                            background: muted ? "#241a1a" : "#14211a",
                            color: muted ? "#ffbdbd" : "#bdf4cf",
                            cursor: "pointer",
                        }}
                        title="Toggle mute (M). Hold V for Push-To-Talk."
                    >
                        {muted ? "Muted (M)" : "Live (M)"}
                    </button>
                    <span style={{ opacity: 0.8 }}>Radius: {radius}m</span>
                    {pushToTalk ? (
                        <span style={{ opacity: 0.65 }}>
                            Hold <b>V</b> to talk
                        </span>
                    ) : (
                        <span style={{ opacity: 0.65 }}>Open mic</span>
                    )}
                </>
            )}
        </div>
    );
}

import React, { useEffect, useRef, useState } from "react";
import "./ui.css";

/**
 * TeamChatPanel
 * Props:
 *  - teamName: string
 *  - members: Array<{ id:string, name:string, color?:string, isOnline?:boolean }>
 *  - messages: Array<{ id:string, senderId:string, text:string, ts:number }>
 *  - myId: string
 *  - onSend: (text:string) => void
 *  - inputDisabled?: boolean
 */
export default function TeamChatPanel({
    teamName = "Team Alpha",
    members = [],
    messages = [],
    myId,
    onSend,
    inputDisabled = false,
    title = "Team Chat",
}) {
    const [text, setText] = useState("");
    const listRef = useRef(null);

    // autoscroll to bottom when new messages arrive if already near bottom
    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
        if (atBottom) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const submit = (e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        onSend?.(t);
        setText("");
    };

    return (
        <section className="ui-panel team-chat">
            <header className="ui-panel__header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{title}</span>
                    <span className="ui-chip">{teamName}</span>
                </div>
                <div className="member-row">
                    {members.map((m) => (
                        <div key={m.id} className="member-pill" title={m.name} style={{ borderColor: m.color || "var(--ui-border)" }}>
                            <div className="ui-avatar" style={{ background: m.color || undefined }}>
                                {initials(m.name)}
                            </div>
                            <span>{m.name}</span>
                            <span className={`dot ${m.isOnline ? "on" : "off"}`} />
                        </div>
                    ))}
                </div>
            </header>

            <div className="ui-panel__body chat-body">
                <div className="chat-list" ref={listRef}>
                    {messages.length === 0 && <div className="ui-empty">No messages yet.</div>}
                    {messages.map((m) => {
                        const mine = m.senderId === myId;
                        const sender = members.find(x => x.id === m.senderId);
                        return (
                            <div key={m.id} className={`bubble ${mine ? "me" : "them"}`}>
                                {!mine && (
                                    <div className="bubble-author">
                                        <div className="ui-avatar" style={{ background: sender?.color || undefined }}>
                                            {initials(sender?.name || "??")}
                                        </div>
                                        <span>{sender?.name || "Unknown"}</span>
                                    </div>
                                )}
                                <div className="bubble-text">{m.text}</div>
                                <time className="bubble-time" dateTime={new Date(m.ts).toISOString()}>
                                    {clock(m.ts)}
                                </time>
                            </div>
                        );
                    })}
                </div>

                <form className="chat-input" onSubmit={submit}>
                    <input
                        type="text"
                        placeholder="Send a message to your team…"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={inputDisabled}
                    />
                    <button className="ui-btn ui-btn--primary" disabled={inputDisabled || text.trim() === ""}>
                        Send
                    </button>
                </form>
            </div>
        </section>
    );
}

function initials(name = "") {
    const [a, b] = String(name).trim().split(/\s+/);
    return ((a?.[0] || "") + (b?.[0] || "")).toUpperCase() || (a?.slice(0, 2).toUpperCase() || "??");
}
function clock(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return "—"; }
}

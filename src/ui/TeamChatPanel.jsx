import React, { useEffect, useRef, useState } from "react";
import "./ui.css";

/**
 * TeamChatPanel — compact card, bottom-left anchored (matches RolePanel style)
 * Props:
 *  - teamName: string
 *  - members: Array<{ id:string, name:string }>
 *  - messages: Array<{ id:string, senderId:string, text:string, ts:number }>
 *  - myId: string
 *  - onSend: (text:string) => void
 *  - inputDisabled?: boolean
 *  - style?: React.CSSProperties
 */
export default function TeamChatPanel({
    teamName = "Team",
    members = [],
    messages = [],
    myId,
    onSend,
    inputDisabled = false,
    style,
}) {
    const [text, setText] = useState("");
    const listRef = useRef(null);

    // autoscroll to bottom if already near bottom
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

    const namesLine =
        members.length > 0 ? members.map((m) => m.name || "Player").join(", ") : "—";

    return (
        <div
            style={{
                position: "absolute",
                left: 10,
                bottom: 10, // ⬅️ left-bottom corner
                background: "rgba(14,17,22,0.9)",
                border: "1px solid #2a3242",
                padding: 10,
                borderRadius: 10,
                display: "grid",
                gap: 10,
                color: "white",
                width: 340,
                maxHeight: "46vh",
                gridTemplateRows: "auto auto 1fr auto",
                ...style,
            }}
        >
            {/* Title line (matches RolePanel label style) */}
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Team — {teamName}
                </div>
            </div>

            {/* Members line */}
            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Members — {namesLine}
                </div>
            </div>

            {/* Messages list */}
            <div
                ref={listRef}
                style={{
                    minHeight: 0,
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    paddingRight: 2,
                }}
            >
                {messages.length === 0 && (
                    <div
                        style={{
                            fontSize: 12,
                            opacity: 0.7,
                            padding: "8px 10px",
                            background: "#1b2433",
                            border: "1px solid #2a3242",
                            borderRadius: 6,
                        }}
                    >
                        No messages yet.
                    </div>
                )}

                {messages.map((m) => {
                    const mine = m.senderId === myId;
                    return (
                        <div
                            key={m.id}
                            style={{
                                alignSelf: mine ? "flex-end" : "flex-start",
                                maxWidth: "85%",
                                background: mine ? "#19324a" : "#1b2433",
                                border: "1px solid #2a3242",
                                borderRadius: 6,
                                padding: "8px 10px",
                                fontSize: 12,
                                lineHeight: 1.35,
                            }}
                            title={new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        >
                            {!mine && (
                                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
                                    {memberName(members, m.senderId)}
                                </div>
                            )}
                            {m.text}
                        </div>
                    );
                })}
            </div>

            {/* Input row */}
            <form onSubmit={submit} style={{ display: "flex", gap: 6 }}>
                <input
                    type="text"
                    placeholder="Send a message to your team…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    disabled={inputDisabled}
                    style={{
                        flex: 1,
                        background: "#0e141f",
                        border: "1px solid #2a3242",
                        color: "white",
                        padding: "8px 10px",
                        borderRadius: 8,
                        fontSize: 12,
                    }}
                />
                <button
                    className="ui-btn ui-btn--primary"
                    disabled={inputDisabled || text.trim() === ""}
                    style={{ padding: "8px 10px" }}
                >
                    Send
                </button>
            </form>
        </div>
    );
}

function memberName(members, id) {
    return members.find((m) => m.id === id)?.name || "Unknown";
}

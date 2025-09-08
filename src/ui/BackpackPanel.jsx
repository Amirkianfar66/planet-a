import React from "react";
import "./ui.css";

/**
 * BackpackPanel
 * Props:
 *  - items: Array<{ id:string, name:string, qty?:number, icon?:string }>
 *  - capacity?: number (for header chip)
 *  - onUse?: (id) => void
 *  - onDrop?: (id) => void
 */
export default function BackpackPanel({
    items = [],
    capacity,
    onUse,
    onDrop,
    title = "Backpack",
}) {
    const used = items.reduce((a, b) => a + (b.qty || 1), 0);
    return (
        <section className="ui-panel">
            <header className="ui-panel__header">
                <span>{title}</span>
                <span className="ui-chip">{capacity ? `${used}/${capacity}` : `${used} items`}</span>
            </header>

            <div className="ui-panel__body">
                {items.length === 0 ? (
                    <div className="ui-empty">No items.</div>
                ) : (
                    <div className="inv-grid">
                        {items.map((it) => (
                            <div className="inv-slot" key={it.id} title={it.name}>
                                <div className="inv-icon">{renderIcon(it)}</div>
                                <div className="inv-name" aria-label={it.name}>{it.name}</div>
                                {it.qty > 1 && <div className="inv-qty">{it.qty}</div>}
                                <div className="inv-actions">
                                    {onUse && (
                                        <button className="ui-btn ui-btn--small" onClick={() => onUse(it.id)}>
                                            Use
                                        </button>
                                    )}
                                    {onDrop && (
                                        <button className="ui-btn ui-btn--danger ui-btn--small" onClick={() => onDrop(it.id)}>
                                            Drop
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function renderIcon(it) {
    if (it.icon) return <span style={{ fontSize: 18 }}>{it.icon}</span>;
    // fallback: initials/emoji-ish based on name
    const ch = (it.name || "?").trim()[0] || "?";
    return <span style={{ fontWeight: 800 }}>{ch.toUpperCase()}</span>;
}

import React, { useMemo } from "react";
import "./ui.css";

/**
 * BackpackPanel
 * Props:
 *  - items: Array<{ id:string, name:string, qty?:number, icon?:string, kind?:string }>
 *  - capacity?: number (for header chip)
 *  - onUse?: (id) => void           // acts on ONE unit from the stack (uses the first item's id)
 *  - onDrop?: (id) => void          // drops ONE unit from the stack (uses the first item's id)
 *  - onThrow?: (id) => void         // throws ONE unit from the stack (uses the first item's id)
 *  - title?: string
 */
export default function BackpackPanel({
    items = [],
    capacity,
    onUse,
    onDrop,
    onThrow,
    title = "Backpack",
}) {
    // Total used slots counts per-item quantities, not grouped display count
    const used = items.reduce((a, b) => a + (Number(b.qty) > 0 ? Number(b.qty) : 1), 0);

    // Group identical items into stacks (same kind/name + same icon)
    const stacks = useMemo(() => {
        const map = new Map();
        for (const it of items) {
            const qty = Math.max(1, Number(it.qty) || 1);
            const key =
                `${(it.kind || it.name || "").trim().toLowerCase()}|${it.icon || ""}`;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    name: it.name || it.kind || "Item",
                    icon: it.icon,
                    qty: 0,
                    ids: [], // keep underlying ids so actions can target a single unit
                });
            }
            const g = map.get(key);
            g.qty += qty;
            g.ids.push(it.id); // keep at least one id per original item
        }
        // Pick a primaryId for actions (use the first id in the stack)
        return Array.from(map.values()).map((g) => ({ ...g, primaryId: g.ids[0] }));
    }, [items]);

    return (
        <section className="ui-panel">
            <header className="ui-panel__header">
                <span>{title}</span>
                <span className="ui-chip">
                    {capacity ? `${used}/${capacity}` : `${used} items`}
                </span>
            </header>

            <div className="ui-panel__body">
                {stacks.length === 0 ? (
                    <div className="ui-empty">No items.</div>
                ) : (
                    <div className="inv-grid">
                        {stacks.map((g) => (
                            <div
                                className="inv-slot"
                                key={g.key}
                                title={`${g.name} × ${g.qty}${onThrow ? " — right-click to throw one" : ""}`}
                                onContextMenu={(e) => {
                                    if (!onThrow) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onThrow(g.primaryId);
                                }}
                            >
                                <div className="inv-icon">
                                    {renderIcon({ name: g.name, icon: g.icon })}
                                    {g.qty > 1 && (
                                        <div className="inv-qty" aria-label={`Quantity ${g.qty}`}>
                                            ×{g.qty}
                                        </div>
                                    )}
                                </div>

                                <div className="inv-name" aria-label={g.name}>
                                    {g.name}
                                </div>

                                <div className="inv-actions">
                                    {onUse && (
                                        <button
                                            className="ui-btn ui-btn--small"
                                            onClick={() => onUse(g.primaryId)}
                                        >
                                            Use
                                        </button>
                                    )}
                                    {onDrop && (
                                        <button
                                            className="ui-btn ui-btn--danger ui-btn--small"
                                            onClick={() => onDrop(g.primaryId)}
                                        >
                                            Drop
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {onThrow && stacks.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
                    Tip: <b>Right-click</b> a stack to throw <b>one</b>.
                </div>
            )}
        </section>
    );
}

function renderIcon(it) {
    if (it.icon) return <span style={{ fontSize: 18 }}>{it.icon}</span>;
    const ch = (it.name || "?").trim()[0] || "?";
    return <span style={{ fontWeight: 800 }}>{ch.toUpperCase()}</span>;
}

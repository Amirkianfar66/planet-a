import React, { useMemo } from "react";
import "./ui.css";

/**
 * BackpackPanel
 * Props:
 *  - items: Array<{ id:string, type?:string, name?:string, qty?:number, icon?:string, kind?:string, stored?:number, cap?:number }>
 *  - capacity?: number
 *  - onUse?: (id) => void
 *  - onDrop?: (id) => void
 *  - onThrow?: (id) => void
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
    // Slots used: each entry in the underlying backpack occupies a slot
    const usedSlots = items.length;

    // Do not stack these (each is rendered as its own tile)
    const NO_STACK = new Set(["food_tank"]);

    // Group identical items into stacks (by type/name/icon), but keep NO_STACK singles
    const stacks = useMemo(() => {
        const groups = new Map();
        const singles = [];

        for (const it of items) {
            const type = String(it.type || it.kind || "").trim().toLowerCase();
            const qty = Math.max(1, Number(it.qty) || 1);

            // Food Tank (container) stays individual so we can show stored/cap
            if (NO_STACK.has(type)) {
                singles.push({
                    key: it.id,
                    primaryId: it.id,
                    type,
                    name: it.name || "Food Tank",
                    icon: it.icon,
                    qty: 1,
                    ids: [it.id],
                    stored: Number(it.stored ?? 0),
                    cap: Number(it.cap ?? 4),
                });
                continue;
            }

            // Group others
            const key = `${type}|${(it.name || type || "item").toLowerCase()}|${it.icon || ""}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    type,
                    name: it.name || type || "Item",
                    icon: it.icon,
                    qty: 0,
                    ids: [],
                });
            }
            const g = groups.get(key);
            g.qty += qty;
            g.ids.push(it.id);
        }

        const grouped = Array.from(groups.values()).map((g) => ({
            ...g,
            primaryId: g.ids[0],
        }));

        return [...grouped, ...singles];
    }, [items]);

    return (
        <section className="ui-panel">
            <header className="ui-panel__header">
                <span>{title}</span>
                <span className="ui-chip">
                    {capacity ? `${usedSlots}/${capacity}` : `${usedSlots} items`}
                </span>
            </header>

            <div className="ui-panel__body">
                {stacks.length === 0 ? (
                    <div className="ui-empty">No items.</div>
                ) : (
                    <div className="inv-grid">
                        {stacks.map((g) => {
                            const isTank = g.type === "food_tank";
                            const useLabel = isTank ? "Load / Unload" : "Use";

                            return (
                                <div
                                    className="inv-slot"
                                    key={g.key}
                                    title={
                                        isTank
                                            ? `Food Tank — ${g.stored}/${g.cap}\nLeft-click: Load if you have food, else Unload`
                                            : `${g.name} × ${g.qty}${onThrow ? " — right-click to throw one" : ""}`
                                    }
                                    onContextMenu={(e) => {
                                        if (!onThrow) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onThrow(g.primaryId);
                                    }}
                                >
                                    <div className="inv-icon">
                                        {renderIcon({ name: g.name, icon: g.icon, type: g.type })}
                                        {/* Count badge for stacks */}
                                        {!isTank && g.qty > 1 && (
                                            <div className="inv-qty" aria-label={`Quantity ${g.qty}`}>
                                                ×{g.qty}
                                            </div>
                                        )}
                                        {/* Fill badge for Food Tank */}
                                        {isTank && (
                                            <div className="inv-qty" aria-label={`Stored ${g.stored} of ${g.cap}`}>
                                                {g.stored}/{g.cap}
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
                                                {useLabel}
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
                            );
                        })}
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
    // Prefer explicit icon prop
    if (it.icon) return <span style={{ fontSize: 18 }}>{it.icon}</span>;

    // Fallback by type
    const TYPE_ICON = {
        food: "🍎",
        fuel: "🔋",
        protection: "🛡️",
        cure_red: "🧪",
        cure_blue: "🧪",
        food_tank: "🧃", // container
    };
    if (it.type && TYPE_ICON[it.type]) {
        return <span style={{ fontSize: 18 }}>{TYPE_ICON[it.type]}</span>;
    }

    // Final fallback: first letter
    const ch = (it.name || "?").trim()[0] || "?";
    return <span style={{ fontWeight: 800 }}>{ch.toUpperCase()}</span>;
}

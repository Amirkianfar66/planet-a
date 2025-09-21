import React, { useMemo, useState } from "react";
import "./ui.css";

/**
 * BackpackPanel (illustrated shell + your own styling)
 * Props: items, capacity, onUse, onDrop, onThrow, title
 */
export default function BackpackPanel({
    items = [],
    capacity,
    onUse,
    onDrop,
    onThrow,
    title = "Backpack",
}) {
    const [selectedKey, setSelectedKey] = useState(null);

    // ----- grouping logic (unchanged)
    const NO_STACK = new Set(["food_tank"]);
    const stacks = useMemo(() => {
        const groups = new Map();
        const singles = [];
        for (const it of items) {
            const type = String(it.type || it.kind || "").trim().toLowerCase();
            const qty = Math.max(1, Number(it.qty) || 1);
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
            const key = `${type}|${(it.name || type || "item").toLowerCase()}|${it.icon || ""}`;
            if (!groups.has(key)) {
                groups.set(key, { key, type, name: it.name || type || "Item", icon: it.icon, qty: 0, ids: [] });
            }
            const g = groups.get(key);
            g.qty += qty;
            g.ids.push(it.id);
        }
        const grouped = Array.from(groups.values()).map((g) => ({ ...g, primaryId: g.ids[0] }));
        return [...grouped, ...singles];
    }, [items]);

    const usedSlots = items.length;
    const selected = stacks.find((s) => s.key === selectedKey) || null;

    const handleUse = () => selected && onUse?.(selected.primaryId);
    const handleDrop = () => selected && onDrop?.(selected.primaryId);

    return (
        <section className="bp bp--illustrated bp--half" data-component="backpack">
            {/* Decorative shell (handle, sides, bumper) */}
            <div className="bp-shell" aria-hidden>
                <div className="bp-shell__handle" />
                <div className="bp-shell__side bp-shell__side--l" />
                <div className="bp-shell__side bp-shell__side--r" />
                <div className="bp-shell__bumper" />
            </div>

            {/* Content sits on a white “rim” and teal “screen” */}
            <div className="bp-rim">
                <header className="bp__header">
                    <h3 className="bp__title">{title.toUpperCase()}</h3>
                    <div className="bp__cap">
                        {capacity ? `${usedSlots}/${capacity}` : `${usedSlots} items`}
                    </div>
                </header>

                <div className="bp-screen">
                    {stacks.length === 0 ? (
                        <div className="bp__empty">No items.</div>
                    ) : (
                        <div className="bp__grid" style={{ "--bp-columns": 3 }}>
                            {stacks.map((g) => {
                                const isTank = g.type === "food_tank";
                                const qtyBadge = isTank ? `${g.stored}/${g.cap}` : g.qty > 1 ? `×${g.qty}` : null;

                                return (
                                    <button
                                        key={g.key}
                                        className="bp-item"
                                        data-type={g.type || "item"}
                                        data-selected={selected?.key === g.key || undefined}
                                        onClick={() => setSelectedKey(g.key)}
                                        onContextMenu={(e) => {
                                            if (!onThrow) return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setSelectedKey(g.key);
                                            onThrow(g.primaryId);
                                        }}
                                        title={
                                            isTank
                                                ? `${g.name} — ${g.stored}/${g.cap}`
                                                : `${g.name}${g.qty > 1 ? ` × ${g.qty}` : ""}`
                                        }
                                    >
                                        <span className="bp-item__icon">{renderIcon(g)}</span>
                                        <span className="bp-item__name">{g.name}</span>
                                        {qtyBadge && <span className="bp-item__qty">{qtyBadge}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="bp-actions">
                        <button
                            className="bp-btn bp-btn--ghost"
                            disabled={!selected || !onDrop}
                            onClick={handleDrop}
                        >
                            DROP
                        </button>
                        <button
                            className="bp-btn"
                            disabled={!selected || !onUse}
                            onClick={handleUse}
                        >
                            USE
                        </button>
                    </div>

                    {onThrow && stacks.length > 0 && (
                        <div className="bp__hint">Right-click a tile to throw one.</div>
                    )}
                </div>
            </div>
        </section>
    );
}
function renderIcon(it) {
    if (it.icon) return <span style={{ fontSize: 26 }}>{it.icon}</span>;
    const TYPE_ICON = {
        food: "🥫", fuel: "🔋", protection: "🛡️", cure_red: "🧪", cure_blue: "🧪", food_tank: "🧃",
    };
    if (it.type && TYPE_ICON[it.type]) return <span style={{ fontSize: 26 }}>{TYPE_ICON[it.type]}</span>;
    const ch = (it.name || "?").trim()[0] || "?";
    return <span style={{ fontWeight: 900, fontSize: 22 }}>{ch.toUpperCase()}</span>;
}

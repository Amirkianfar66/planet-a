import React, { useMemo, useState } from "react";
import "./ui.css";

/**
 * Cartoon-styled Backpack panel (matches your reference image)
 * Props are identical to BackpackPanel:
 *  - items, capacity, onUse, onDrop, onThrow, title
 */
export default function BackpackPanelCartoon({
    items = [],
    capacity,
    onUse,
    onDrop,
    onThrow,
    title = "Backpack",
}) {
    const [selectedKey, setSelectedKey] = useState(null);

    // Same stacking logic as before (Food Tank stays single)
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
        const grouped = Array.from(groups.values()).map((g) => ({ ...g, primaryId: g.ids[0] }));
        return [...grouped, ...singles];
    }, [items]);

    const usedSlots = items.length;

    // Bucket by the 3 categories shown in the mock
    const buckets = useMemo(() => {
        const bucket = { food: [], cure: [], protection: [] };
        for (const g of stacks) {
            if (g.type?.startsWith("food")) bucket.food.push(g);
            else if (g.type?.startsWith("cure")) bucket.cure.push(g);
            else if (g.type?.startsWith("protection")) bucket.protection.push(g);
        }
        return bucket;
    }, [stacks]);

    const allInOrder = [
        { label: "FOOD", key: "food", icon: "🥫" },
        { label: "CURE", key: "cure", icon: "🧪" },
        { label: "PROTECTION", key: "protection", icon: "🛡️" },
    ];

    const selected = stacks.find((s) => s.key === selectedKey) || null;

    const handleThrow = () => {
        if (onThrow && selected) onThrow(selected.primaryId);
    };
    const handleDrop = () => {
        if (onDrop && selected) onDrop(selected.primaryId);
    };
    const handleUse = () => {
        if (onUse && selected) onUse(selected.primaryId);
    };

    return (
        <section className="bp-pack">
            {/* Backpack casing */}
            <div className="bp-shell">
                <header className="bp-top">
                    <div className="bp-handle" />
                    <div className="bp-title">{title.toUpperCase()}</div>
                    <div className="bp-cap">{capacity ? `${usedSlots}/${capacity}` : `${usedSlots} items`}</div>
                </header>

                {/* Inside panel */}
                <div className="bp-inner">
                    <div className="bp-rows">
                        {allInOrder.map(({ label, key, icon }) => {
                            const content = buckets[key];
                            // Show first stack (primary) for the big icon; quantity shown below
                            const g = content?.[0];
                            const qty =
                                (g?.type === "food_tank")
                                    ? `${g.stored}/${g.cap}`
                                    : (content?.reduce((n, s) => n + (s.qty || 1), 0) || 0);

                            return (
                                <button
                                    key={key}
                                    className={`bp-card ${selected?.key && buckets[key]?.some(s => s.key === selected.key) ? "is-active" : ""}`}
                                    onClick={() => setSelectedKey(g ? g.key : null)}
                                    onContextMenu={(e) => {
                                        if (!onThrow || !g) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedKey(g.key);
                                        onThrow(g.primaryId);
                                    }}
                                    title={
                                        g
                                            ? `${g.name}${g.type === "food_tank" ? ` — ${g.stored}/${g.cap}` : ` × ${qty}`}`
                                            : "Empty"
                                    }
                                >
                                    <div className="bp-card__title">{label}</div>
                                    <div className="bp-card__icon">{g ? renderIcon(g) : icon}</div>
                                    <div className="bp-card__qty">{g ? (g.type === "food_tank" ? qty : `×${qty}`) : "—"}</div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Big actions row */}
                    <div className="bp-actions">
                        <button
                            className="bp-btn bp-btn--ghost"
                            disabled={!selected || !onDrop}
                            onClick={handleDrop}
                            title={selected ? `Drop ${selected.name}` : "Select an item first"}
                        >
                            DROP
                        </button>
                        <button
                            className="bp-btn"
                            disabled={!selected || !onUse}
                            onClick={handleUse}
                            title={selected ? `Use ${selected.name}` : "Select an item first"}
                        >
                            USE
                        </button>
                    </div>

                    {/* Hint */}
                    {onThrow && (
                        <div className="bp-hint">
                            Tip: <b>Right-click</b> a card to throw <b>one</b>.
                        </div>
                    )}
                </div>

                {/* Bottom bumper */}
                <div className="bp-bumper" />
            </div>
        </section>
    );
}

function renderIcon(it) {
    if (it.icon) return <span style={{ fontSize: 26 }}>{it.icon}</span>;
    const TYPE_ICON = {
        food: "🥫",
        fuel: "🔋",
        protection: "🛡️",
        cure_red: "🧪",
        cure_blue: "🧪",
        food_tank: "🧃",
    };
    if (it.type && TYPE_ICON[it.type]) return <span style={{ fontSize: 26 }}>{TYPE_ICON[it.type]}</span>;
    const ch = (it.name || "?").trim()[0] || "?";
    return <span style={{ fontWeight: 900, fontSize: 22 }}>{ch.toUpperCase()}</span>;
}

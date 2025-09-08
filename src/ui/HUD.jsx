import { StatusBarsPanel, RolePanel, BackpackPanel, TeamChatPanel } from "./ui";
import "./ui/ui.css";

export default function HUD({ game }) {
    const me = game.me; // { id, role, objective, backpack:[], teamName, teamMembers:[] }
    return (
        <div style={{
            position: "absolute", inset: 16, display: "grid", gap: 16,
            gridTemplateColumns: "300px 1fr 350px"
        }}>
            <div style={{ display: "grid", gap: 16 }}>
                <StatusBarsPanel energy={game.meters.energy} oxygen={game.meters.oxygen} />
                <RolePanel
                    role={me.role}
                    objective={me.objective}
                    tips={me.roleTips || []}
                    onPingObjective={() => game.requestAction("pingObjective")}
                />
            </div>

            {/* Center column could be the game viewport or EventsFeed/VotePanel, etc. */}

            <div style={{ display: "grid", gap: 16 }}>
                <BackpackPanel
                    items={me.backpack}
                    capacity={me.capacity}
                    onUse={(id) => game.requestAction("useItem", { id })}
                    onDrop={(id) => game.requestAction("dropItem", { id })}
                />
                <TeamChatPanel
                    teamName={me.teamName}
                    members={game.teamMembers}
                    messages={game.teamMessages}
                    myId={me.id}
                    onSend={(text) => game.requestAction("chat", { text })}
                />
            </div>
        </div>
    );
}

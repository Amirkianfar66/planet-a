// src/ui/index.js

// Base UI
import * as TopBarMod from "./TopBar.jsx";
import * as CenteredMod from "./Centered.jsx";
import * as MetersPanelMod from "./MetersPanel.jsx";
import * as EventsFeedMod from "./EventsFeed.jsx";
import * as VotePanelMod from "./VotePanel.jsx";

// New panels
import * as StatusBarsPanelMod from "./StatusBarsPanel.jsx";
import * as RolePanelMod from "./RolePanel.jsx";
import * as BackpackPanelMod from "./BackpackPanel.jsx";
import * as TeamChatPanelMod from "./TeamChatPanel.jsx";

// Export *named* symbols that work whether modules use default or named exports
export const TopBar = TopBarMod.default ?? TopBarMod.TopBar;
export const Centered = CenteredMod.default ?? CenteredMod.Centered;
export const MetersPanel = MetersPanelMod.default ?? MetersPanelMod.MetersPanel;
export const EventsFeed = EventsFeedMod.default ?? EventsFeedMod.EventsFeed;
export const VotePanel = VotePanelMod.default ?? VotePanelMod.VotePanel;

export const StatusBarsPanel = StatusBarsPanelMod.default ?? StatusBarsPanelMod.StatusBarsPanel;
export const RolePanel = RolePanelMod.default ?? RolePanelMod.RolePanel;
export const BackpackPanel = BackpackPanelMod.default ?? BackpackPanelMod.BackpackPanel;
export const TeamChatPanel = TeamChatPanelMod.default ?? TeamChatPanelMod.TeamChatPanel;

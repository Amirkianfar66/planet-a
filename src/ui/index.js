// src/ui/index.js
import * as CenteredMod from "./Centered.jsx";
import * as MetersPanelMod from "./MetersPanel.jsx";
import * as EventsFeedMod from "./EventsFeed.jsx";
import * as VotePanelMod from "./VotePanel.jsx";

import * as StatusBarsPanelMod from "./StatusBarsPanel.jsx";
import * as RolePanelMod from "./RolePanel.jsx";
import * as BackpackPanelMod from "./BackpackPanel.jsx";
import * as TeamChatPanelMod from "./TeamChatPanel.jsx";

// Re-export as NAMED symbols, whether each module uses default or named exports
export const Centered = CenteredMod.default ?? CenteredMod.Centered;
export const MetersPanel = MetersPanelMod.default ?? MetersPanelMod.MetersPanel;
export const EventsFeed = EventsFeedMod.default ?? EventsFeedMod.EventsFeed;
export const VotePanel = VotePanelMod.default ?? VotePanelMod.VotePanel;

export const StatusBarsPanel = StatusBarsPanelMod.default ?? StatusBarsPanelMod.StatusBarsPanel;
export const RolePanel = RolePanelMod.default ?? RolePanelMod.RolePanel;
export const BackpackPanel = BackpackPanelMod.default ?? BackpackPanelMod.BackpackPanel;
export const TeamChatPanel = TeamChatPanelMod.default ?? TeamChatPanelMod.TeamChatPanel;

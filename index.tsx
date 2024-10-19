/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, Menu, PermissionStore, showToast, Toasts, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    enableStickyVc: {
        type: OptionType.BOOLEAN,
        description: "Enable Sticky VC",
        hidden: true,
        default: false
    },
    stickyVcChannel: {
        type: OptionType.STRING,
        description: "The channel to rejoin when kicked or moved.",
        hidden: true,
        default: ""
    }
});

let userId: string | null = null;
const ChannelActions: {
    disconnect: () => void;
    selectVoiceChannel: (channelId: string) => void;
} = findByPropsLazy("disconnect", "selectVoiceChannel");

const VoiceStateStore = findByPropsLazy("getVoiceState", "getVoiceStatesForChannel");

function checkAndMoveToStickyVc() {
    const myVoiceState = VoiceStateStore.getVoiceState(UserStore.getCurrentUser().id);
    const currentChannelId = myVoiceState?.channelId;

    const channel = ChannelStore.getChannel(settings.store.stickyVcChannel);

    if (!channel || !channel.isVocal()) {
        showToast("Sticky VC channel is not valid or is not a voice channel.", Toasts.Type.FAILURE);
        return;
    }

    const canConnect = PermissionStore.can(1n << 20n, channel);

    if (settings.store.enableStickyVc && settings.store.stickyVcChannel !== currentChannelId) {
        if (canConnect) {
            ChannelActions.selectVoiceChannel(settings.store.stickyVcChannel);
            showToast("Rejoining sticky VC", Toasts.Type.MESSAGE);
        } else {
            showToast("You do not have permission to join the Sticky VC.", Toasts.Type.FAILURE);
        }
    }
}


function handleVoiceStateUpdate({ voiceStates }: { voiceStates: any[]; }) {
    const myId = UserStore.getCurrentUser().id;
    const channel = ChannelStore.getChannel(settings.store.stickyVcChannel);

    if (!channel || !channel.isVocal()) return;

    voiceStates.forEach(state => {
        const { userId, channelId } = state;
        const isMe = userId === myId;

        if (!isMe) return;

        const canRejoin = settings.store.enableStickyVc && settings.store.stickyVcChannel !== channelId && PermissionStore.can(1n << 20n, channel);

        if (canRejoin) {
            ChannelActions.selectVoiceChannel(settings.store.stickyVcChannel);
        }
    });
}

// i stole this from voiceChannelLog lol
const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }) => {
    const isVc = channel.isVocal();

    const stickyVcCategory = (
        <Menu.MenuGroup id="sticky-vc-options" key="sticky-vc-options">
            <Menu.MenuCheckboxItem
                id="vc-enable-sticky-vc"
                label="Enable Sticky VC"
                action={() => {
                    settings.store.enableStickyVc = !settings.store.enableStickyVc;

                    settings.store.enableStickyVc && checkAndMoveToStickyVc();
                }}
                checked={settings.store.enableStickyVc}
                disabled={!isVc}
            />
            <Menu.MenuItem
                id="vc-set-sticky-vc"
                label="Set Sticky VC Channel"
                action={() => {
                    settings.store.stickyVcChannel = channel.id;
                    showToast(`Sticky VC channel set to ${channel.name}`, Toasts.Type.MESSAGE);

                    settings.store.enableStickyVc && checkAndMoveToStickyVc();
                }}
                disabled={!isVc}
            />
        </Menu.MenuGroup>
    );

    children.push(stickyVcCategory);
};

export default definePlugin({
    name: "stickyVc",
    description: "Rejoin a voice channel when kicked or moved.",
    authors: [{
        name: "Creation's",
        id: 209830981060788225n
    }],
    settings,
    flux: {
        VOICE_STATE_UPDATES: handleVoiceStateUpdate
    },
    contextMenus: {
        "channel-context": patchChannelContextMenu
    },
    start() {
        userId = UserStore.getCurrentUser().id;
        checkAndMoveToStickyVc();
    }
});

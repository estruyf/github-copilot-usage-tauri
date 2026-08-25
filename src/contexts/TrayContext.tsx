import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, MenuItemOptions, PredefinedMenuItemOptions, CheckMenuItemOptions } from '@tauri-apps/api/menu';
import { invoke } from '@tauri-apps/api/core';
import { USAGE_SOURCE_LABELS, type UsageSource } from '../types';

type CopilotMenuInfo = {
  premiumUsed: number;
  premiumLimit: number;
  premiumRemaining: number;
  /** Friendly licence name, e.g. "Copilot Pro+". */
  plan: string | null;
  organizations: string[];
};

type ClaudeMenuWindow = {
  label: string;
  percent: number;
  resetsAt: string | null;
};

type ClaudeMenuInfo = {
  windows: ClaudeMenuWindow[];
};

type MenuState = {
  copilot: CopilotMenuInfo | null;
  claude: ClaudeMenuInfo | null;
  /** A Claude Code login exists on this machine, so the source is selectable. */
  claudeAvailable: boolean;
};

type TrayContextType = {
  setText: (text?: string) => Promise<void>;
  close: () => Promise<void>;
  tray: TrayIcon | null;
  updateMenu: (state: MenuState | null) => Promise<void>;
  source: UsageSource;
  setSource: (source: UsageSource) => void;
};

const SOURCE_STORAGE_KEY = 'usageSource';

const TrayContext = createContext<TrayContextType | null>(null);

export const useTray = (): TrayContextType => {
  const ctx = useContext(TrayContext);
  if (!ctx) throw new Error('useTray must be used within a TrayProvider');
  return ctx;
};

export const TrayProvider: React.FC<{ tray: TrayIcon | null; children?: React.ReactNode }> = ({ tray, children }) => {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [source, setSourceState] = useState<UsageSource>(() => {
    const stored = localStorage.getItem(SOURCE_STORAGE_KEY);
    return stored === 'claude' ? 'claude' : 'copilot';
  });

  const setSource = useCallback((next: UsageSource) => {
    setSourceState(next);
    localStorage.setItem(SOURCE_STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    const checkAutostart = async () => {
      try {
        const enabled = await invoke<boolean>('is_autostart_enabled');
        setAutostartEnabled(enabled);
      } catch (e) {
        console.debug('Failed to check autostart status:', e);
      }
    };
    checkAutostart();
  }, []);

  const toggleAutostart = useCallback(async () => {
    try {
      if (autostartEnabled) {
        await invoke('disable_autostart');
        setAutostartEnabled(false);
      } else {
        await invoke('enable_autostart');
        setAutostartEnabled(true);
      }
    } catch (e) {
      console.error('Failed to toggle autostart:', e);
    }
  }, [autostartEnabled]);

  const setText = useCallback(async (text?: string) => {
    const tooltip = `${USAGE_SOURCE_LABELS[source]} Usage${text ? ` - ${text.trim()}` : ''}`;
    try {
      if (tray) {
        await tray.setTitle(text ?? '');
        await tray.setTooltip(tooltip);
      } else {
        // fallback: try to find the tray by id
        const found = await TrayIcon.getById('main');
        await found?.setTitle(text ?? '');
        await found?.setTooltip(tooltip);
      }
    } catch (e) {
      // ignore errors when running on platforms that don't support titles
      console.debug('setText error', e);
    }
  }, [tray, source]);

  const close = useCallback(async () => {
    const found = await TrayIcon.getById('main');
    found?.close();
  }, []);

  const updateMenu = useCallback(async (state: MenuState | null) => {
    try {
      const targetTray = tray ?? await TrayIcon.getById('main');
      if (!targetTray) return;

      const items: Array<MenuItemOptions | PredefinedMenuItemOptions | CheckMenuItemOptions> = [];

      // Usage for whichever source is currently selected.
      if (source === 'copilot' && state?.copilot) {
        const { premiumUsed, premiumLimit, premiumRemaining, plan, organizations } = state.copilot;
        items.push(
          { id: 'usage_header', text: 'Premium Requests', enabled: false },
          { id: 'usage_used', text: `  Used: ${premiumUsed} / ${premiumLimit}`, enabled: false },
          { id: 'usage_remaining', text: `  Remaining: ${premiumRemaining}`, enabled: false }
        );
        if (plan) {
          const org = organizations.length > 0 ? ` (${organizations.join(', ')})` : '';
          items.push({ id: 'usage_plan', text: `  License: ${plan}${org}`, enabled: false });
        }
        items.push({ item: 'Separator' });
      } else if (source === 'claude' && state?.claude) {
        items.push({ id: 'usage_header', text: 'Claude Usage', enabled: false });
        state.claude.windows.forEach((window, index) => {
          const reset = window.resetsAt ? `, resets ${window.resetsAt}` : '';
          items.push({
            id: `claude_window_${index}`,
            text: `  ${window.label}: ${window.percent}%${reset}`,
            enabled: false,
          });
        });
        items.push({ item: 'Separator' });
      }

      // Source picker - radio behaviour via mutually exclusive check items.
      items.push({ id: 'source_header', text: 'Show usage for', enabled: false });
      (Object.keys(USAGE_SOURCE_LABELS) as UsageSource[]).forEach((option) => {
        const isClaudeUnavailable = option === 'claude' && !state?.claudeAvailable;
        items.push({
          id: `source_${option}`,
          text: isClaudeUnavailable
            ? `${USAGE_SOURCE_LABELS[option]} (not connected)`
            : USAGE_SOURCE_LABELS[option],
          checked: source === option,
          // Selecting an unconnected source would only ever show a blank bar.
          enabled: !isClaudeUnavailable,
          action: () => setSource(option),
        } as CheckMenuItemOptions);
      });

      items.push(
        { item: 'Separator' },
        {
          id: 'show',
          text: 'Show App',
          action: () => {
            invoke('show_window');
          },
        },
        { item: 'Separator' },
        {
          id: 'autostart',
          text: 'Start at Login',
          checked: autostartEnabled,
          action: toggleAutostart,
        } as CheckMenuItemOptions,
        { item: 'Separator' },
        {
          id: 'quit',
          text: 'Quit',
          action: () => {
            invoke('close_app');
          },
        }
      );

      const menu = await Menu.new({ items });
      await targetTray.setMenu(menu);
    } catch (e) {
      console.debug('Failed to update tray menu:', e);
    }
  }, [tray, autostartEnabled, toggleAutostart, source, setSource]);

  useEffect(() => {
    invoke('set_tray_icon');
  }, []);

  return (
    <TrayContext.Provider value={{ setText, close, tray, updateMenu, source, setSource }}>
      {children}
    </TrayContext.Provider>
  );
};

export default TrayContext;

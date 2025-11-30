import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, MenuItemOptions, PredefinedMenuItemOptions } from '@tauri-apps/api/menu';
import { invoke } from '@tauri-apps/api/core';

type UsageInfo = {
  premiumUsed: number;
  premiumLimit: number;
  premiumRemaining: number;
};

type TrayContextType = {
  setText: (text?: string) => Promise<void>;
  close: () => Promise<void>;
  tray: TrayIcon | null;
  updateMenu: (usage: UsageInfo | null) => Promise<void>;
};

const TrayContext = createContext<TrayContextType | null>(null);

export const useTray = (): TrayContextType => {
  const ctx = useContext(TrayContext);
  if (!ctx) throw new Error('useTray must be used within a TrayProvider');
  return ctx;
};

export const TrayProvider: React.FC<{ tray: TrayIcon | null; children?: React.ReactNode }> = ({ tray, children }) => {

  const setText = useCallback(async (text?: string) => {
    try {
      if (tray) {
        await tray.setTitle(text ?? '');
        await tray.setTooltip(`GitHub Copilot Usage${text ? ` - ${text}` : ''}`);
      } else {
        // fallback: try to find the tray by id
        const found = await TrayIcon.getById('main');
        await found?.setTitle(text ?? '');
        await found?.setTooltip(`GitHub Copilot Usage${text ? ` - ${text}` : ''}`);
      }
    } catch (e) {
      // ignore errors when running on platforms that don't support titles
      console.debug('setText error', e);
    }
  }, [tray]);

  const close = useCallback(async () => {
    const found = await TrayIcon.getById('main');
    found?.close();
  }, []);

  const updateMenu = useCallback(async (usage: UsageInfo | null) => {
    try {
      const targetTray = tray ?? await TrayIcon.getById('main');
      if (!targetTray) return;

      const items: Array<MenuItemOptions | PredefinedMenuItemOptions> = [];

      if (usage) {
        items.push(
          {
            id: 'usage_header',
            text: 'Premium Requests',
            enabled: false,
          },
          {
            id: 'usage_used',
            text: `  Used: ${usage.premiumUsed} / ${usage.premiumLimit}`,
            enabled: false,
          },
          {
            id: 'usage_remaining',
            text: `  Remaining: ${usage.premiumRemaining}`,
            enabled: false,
          },
          {
            item: 'Separator',
          }
        );
      }

      items.push(
        {
          id: 'show',
          text: 'Show App',
          action: () => {
            invoke('show_window');
          },
        },
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
      console.debug('updateMenu error', e);
    }
  }, [tray]);

  useEffect(() => {
    invoke('set_tray_icon');
  }, []);

  return (
    <TrayContext.Provider value={{ setText, close, tray, updateMenu }}>
      {children}
    </TrayContext.Provider>
  );
};

export default TrayContext;

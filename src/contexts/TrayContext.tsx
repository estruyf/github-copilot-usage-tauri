import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { TrayIcon } from '@tauri-apps/api/tray';
import { invoke } from '@tauri-apps/api/core';
import type { TrayIconColor } from '../constants';

type TrayContextType = {
  setText: (text?: string) => Promise<void>;
  setIconColor: (color: TrayIconColor) => Promise<void>;
  close: () => Promise<void>;
  tray: TrayIcon | null;
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

  const setIconColor = useCallback(async (color: TrayIconColor) => {
    try {
      await invoke('set_tray_icon_color', { color });
    } catch (e) {
      console.debug('setIconColor error', e);
    }
  }, []);

  useEffect(() => {
    invoke('set_tray_icon');
  }, []);

  return (
    <TrayContext.Provider value={{ setText, setIconColor, close, tray }}>
      {children}
    </TrayContext.Provider>
  );
};

export default TrayContext;

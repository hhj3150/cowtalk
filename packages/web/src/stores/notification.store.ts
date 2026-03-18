// 실시간 알림 스토어

import { create } from 'zustand';
import type { Severity } from '@cowtalk/shared';

export interface AppNotification {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly severity: Severity;
  readonly farmId: string | null;
  readonly animalId: string | null;
  readonly createdAt: Date;
  readonly read: boolean;
}

interface NotificationState {
  readonly notifications: readonly AppNotification[];
  readonly unreadCount: number;
  readonly isDrawerOpen: boolean;
}

interface NotificationActions {
  readonly addNotification: (notification: AppNotification) => void;
  readonly markAsRead: (id: string) => void;
  readonly markAllAsRead: () => void;
  readonly removeNotification: (id: string) => void;
  readonly clearAll: () => void;
  readonly toggleDrawer: () => void;
  readonly setDrawerOpen: (open: boolean) => void;
}

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  (set, get) => ({
    notifications: [],
    unreadCount: 0,
    isDrawerOpen: false,

    addNotification: (notification) => {
      const state = get();
      set({
        notifications: [notification, ...state.notifications].slice(0, 100),
        unreadCount: state.unreadCount + 1,
      });
    },

    markAsRead: (id) => {
      const state = get();
      const found = state.notifications.find((n) => n.id === id && !n.read);
      set({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n,
        ),
        unreadCount: found ? Math.max(state.unreadCount - 1, 0) : state.unreadCount,
      });
    },

    markAllAsRead: () =>
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      })),

    removeNotification: (id) =>
      set((state) => {
        const removed = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: removed && !removed.read
            ? Math.max(state.unreadCount - 1, 0)
            : state.unreadCount,
        };
      }),

    clearAll: () => set({ notifications: [], unreadCount: 0 }),

    toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

    setDrawerOpen: (open) => set({ isDrawerOpen: open }),
  }),
);

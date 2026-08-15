import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  Tooltip,
  Typography,
} from '@mui/material';
import { Notifications } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../services/api';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
  action_url?: string | null;
};

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let notificationCache: NotificationItem[] = [];
let cacheUpdatedAt = 0;
let activeRequest: Promise<NotificationItem[]> | null = null;
const listeners = new Set<(items: NotificationItem[]) => void>();

function publish(items: NotificationItem[]) {
  notificationCache = items;
  cacheUpdatedAt = Date.now();
  listeners.forEach((listener) => listener(items));
}

async function requestNotifications(token: string, force = false) {
  if (!force && Date.now() - cacheUpdatedAt < POLL_INTERVAL_MS) {
    return notificationCache;
  }
  if (activeRequest) return activeRequest;

  activeRequest = fetch(`${API_BASE}/api/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Notifications failed with HTTP ${response.status}`);
      const body = await response.json();
      const items = Array.isArray(body.notifications) ? body.notifications : [];
      publish(items);
      return items;
    })
    .finally(() => {
      activeRequest = null;
    });

  return activeRequest;
}

export default function NotificationCenter() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<NotificationItem[]>(notificationCache);
  const navigate = useNavigate();
  const mounted = useRef(true);
  const token = localStorage.getItem('token') || '';

  const load = useCallback(async (force = false) => {
    if (!token || document.visibilityState === 'hidden') return;
    try {
      const next = await requestNotifications(token, force);
      if (mounted.current) setItems(next);
    } catch (error) {
      console.warn('Notification refresh failed:', error);
    }
  }, [token]);

  useEffect(() => {
    mounted.current = true;
    const listener = (next: NotificationItem[]) => setItems(next);
    listeners.add(listener);
    void load();

    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      mounted.current = false;
      listeners.delete(listener);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load]);

  const read = async (item: NotificationItem) => {
    const response = await fetch(`${API_BASE}/api/notifications/${item.id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    publish(items.map((notification) => (
      notification.id === item.id ? { ...notification, is_read: true } : notification
    )));
    setAnchor(null);
    if (item.action_url) navigate(item.action_url);
  };

  const markAllRead = async () => {
    const response = await fetch(`${API_BASE}/api/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) publish(items.map((item) => ({ ...item, is_read: true })));
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={(event) => {
            setAnchor(event.currentTarget);
            void load(true);
          }}
          aria-label="Open notifications"
        >
          <Badge badgeContent={items.filter((item) => !item.is_read).length} color="error">
            <Notifications />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { width: 380, maxWidth: '95vw', maxHeight: 520 } }}
      >
        <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight={800}>Notifications</Typography>
          <Button size="small" onClick={() => void markAllRead()}>Mark all read</Button>
        </Box>
        <Divider />
        {items.length ? (
          <List disablePadding>
            {items.map((item) => (
              <ListItemButton
                key={item.id}
                onClick={() => void read(item)}
                sx={{ bgcolor: item.is_read ? 'transparent' : 'rgba(0,212,255,.08)' }}
              >
                <ListItemText
                  primary={item.title}
                  secondary={(
                    <>
                      <span>{item.message}</span><br />
                      <small>{new Date(item.created_at).toLocaleString()}</small>
                    </>
                  )}
                />
              </ListItemButton>
            ))}
          </List>
        ) : (
          <Typography sx={{ p: 3, color: 'text.secondary' }}>You’re all caught up.</Typography>
        )}
      </Menu>
    </>
  );
}

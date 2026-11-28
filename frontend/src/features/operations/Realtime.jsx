import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client.js';
import { protectedRequest, refreshSession } from '../auth/api.js';
import { useAuthStore } from '../auth/state.js';
import { useSiteSettings } from '../site/public.jsx';
import { presenceDefaults } from '../../../../shared/operations.js';

const Realtime = createContext(null);
const browserKey = 'fdfs.presence';
const consentKey = 'fdfs.analytics';
const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const routes = new Set([
  'cinema',
  'originals',
  'podcasts',
  'live',
  'talent',
  'reviews',
  'account',
  'dashboard',
  'support',
]);
const detailRoutes = new Set([
  'cinema',
  'originals',
  'podcasts',
  'live',
  'talent',
]);
export function routeCategory(path) {
  const [, root, slug, extra] = path.split('/');
  if (root === 'admin' || root === '_dev') return null;
  if (root === 'movies')
    return {
      module: 'reviews',
      ...(slug?.length <= 90 &&
        validSlug.test(slug) &&
        !extra && { content: slug }),
    };
  if (root === 'reviews' && /^[a-f0-9-]{36}$/.test(slug ?? '') && !extra)
    return { module: 'reviews', content: 'review-' + slug };
  return {
    module: !root ? 'home' : routes.has(root) ? root : 'other',
    ...(detailRoutes.has(root) &&
      slug?.length <= 90 &&
      validSlug.test(slug) &&
      !extra && { content: slug }),
  };
}

function device() {
  if (window.matchMedia('(max-width: 639px)').matches) return 'mobile';
  if (window.matchMedia('(max-width: 1023px)').matches) return 'tablet';
  return 'desktop';
}
function browserId() {
  try {
    const current = JSON.parse(localStorage.getItem(browserKey));
    if (current?.id && current.expiresAt > Date.now()) return current.id;
    const record = {
      id: crypto.randomUUID(),
      expiresAt: Date.now() + 86400000,
    };
    localStorage.setItem(browserKey, JSON.stringify(record));
    return record.id;
  } catch {
    return undefined;
  }
}

function initialConsent() {
  try {
    return localStorage.getItem(consentKey) === 'allow';
  } catch {
    return false;
  }
}

export function AnalyticsPreferences() {
  const [allow, setAllow] = useState(initialConsent);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === consentKey || event.key === null)
        setAllow(initialConsent());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={allow}
        onChange={(event) => {
          const value = event.target.checked;
          setAllow(value);
          try {
            localStorage.setItem(consentKey, value ? 'allow' : 'deny');
          } catch {
            /* This page still honors the choice. */
          }
          window.dispatchEvent(
            new CustomEvent('fdfs:consent', { detail: value }),
          );
        }}
      />
      Share optional first-party analytics
    </label>
  );
}

export function useRealtime() {
  return useContext(Realtime);
}

export function RealtimeProvider({ children }) {
  const { pathname } = useLocation();
  const settings = useSiteSettings();
  const token = useAuthStore((state) => state.accessToken);
  const status = useAuthStore((state) => state.status);
  const client = useQueryClient();
  const [allowed, setAllowed] = useState(initialConsent);
  const [socket, setSocket] = useState(null);
  const ready = status !== 'checking';
  const scope = routeCategory(pathname);
  const module = scope?.module;
  const content = scope?.content;
  const pulse = useRef(null);
  const seen = useRef({ route: '', page: false, playback: false });
  const playing = useRef(false);
  const activity = useRef(performance.now());
  const route = pathname;
  if (seen.current.route !== route) {
    seen.current = { route, page: false, playback: false };
    playing.current = false;
    activity.current = performance.now();
  }

  useEffect(() => {
    const sameTab = (event) => setAllowed(event.detail === true);
    const otherTab = (event) => {
      if (event.key === consentKey || event.key === null)
        setAllowed(initialConsent());
    };
    window.addEventListener('fdfs:consent', sameTab);
    window.addEventListener('storage', otherTab);
    return () => {
      window.removeEventListener('fdfs:consent', sameTab);
      window.removeEventListener('storage', otherTab);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    void import('socket.io-client')
      .then(({ io }) => {
        if (!disposed)
          setSocket(
            io(
              import.meta.env.VITE_SOCKET_URL?.trim() ||
                new URL(apiClient.defaults.baseURL, window.location.origin)
                  .origin,
              {
                autoConnect: false,
                withCredentials: false,
                reconnectionAttempts: 12,
                reconnectionDelayMax: 12000,
              },
            ),
          );
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!socket || status === 'checking') return;
    socket.auth = token ? { token } : {};
    const notice = () => {
      void client.invalidateQueries({ queryKey: ['notices'] });
      void client.invalidateQueries({ queryKey: ['support-tickets'] });
      void client.invalidateQueries({ queryKey: ['reviews'] });
    };
    const connect = () => {
      pulse.current?.();
      if (socket.auth.token) {
        socket.timeout(5000).emit('notice:subscribe', {}, () => {});
        notice();
      }
    };
    const renew = (error) => {
      if (!socket.auth.token) return;
      if (error?.data?.code === 'ACCOUNT_RESTRICTED') {
        socket.auth = {};
        socket.connect();
      } else if (error?.data?.code === 'AUTH_REQUIRED') {
        void refreshSession(token).catch(() => {});
      }
    };
    socket.on('connect', connect);
    socket.on('connect_error', renew);
    socket.on('notice:changed', notice);
    const online = () => {
      if (!socket.connected) socket.connect();
    };
    window.addEventListener('online', online);
    socket.connect();
    return () => {
      socket.off('connect', connect);
      socket.off('connect_error', renew);
      socket.off('notice:changed', notice);
      window.removeEventListener('online', online);
      socket.disconnect();
    };
  }, [client, socket, status, token]);

  useEffect(() => {
    if (!socket) return;
    let timeout;
    let disposed = false;
    const publish = () => {
      if (!socket.connected || disposed) return;
      clearTimeout(timeout);
      socket.timeout(5000).emit(
        'presence:pulse',
        {
          browser: browserId(),
          module,
          visible:
            document.visibilityState !== 'hidden' &&
            performance.now() - activity.current < presenceDefaults.idleMs,
          device: device(),
          event: module === 'live' ? content : undefined,
          ...(module === 'live' && { playing: playing.current }),
        },
        (error, ack) => {
          if (disposed) return;
          if (socket.auth.token && ack?.code === 'ACCOUNT_RESTRICTED') {
            socket.auth = {};
            socket.disconnect().connect();
            return;
          }
          if (token && ack?.code === 'AUTH_REQUIRED')
            void refreshSession(token).catch(() => {});
          timeout = setTimeout(
            publish,
            error
              ? presenceDefaults.heartbeatMs
              : (ack?.data?.heartbeatMs ?? presenceDefaults.heartbeatMs),
          );
        },
      );
    };
    pulse.current = publish;
    publish();
    const resume = () => {
      const now = performance.now();
      const hadBeenIdle = now - activity.current >= presenceDefaults.idleMs;
      activity.current = now;
      if (hadBeenIdle) publish();
    };
    const visibility = () => {
      if (document.visibilityState !== 'hidden')
        activity.current = performance.now();
      publish();
    };
    const activities = ['pointerdown', 'keydown', 'scroll'];
    document.addEventListener('visibilitychange', visibility);
    for (const type of activities)
      window.addEventListener(type, resume, { passive: true });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', visibility);
      for (const type of activities) window.removeEventListener(type, resume);
      if (pulse.current === publish) pulse.current = null;
    };
  }, [content, module, socket, token]);

  useEffect(() => {
    if (!module) return;
    function send(kind) {
      if (
        status === 'checking' ||
        !allowed ||
        settings.analyticsOpen === false ||
        seen.current[kind]
      )
        return;
      const record = seen.current;
      record[kind] = true;
      const payload = {
        id: crypto.randomUUID(),
        kind,
        module,
        device: device(),
        content,
      };
      const request = token
        ? protectedRequest({
            url: '/analytics/events',
            method: 'post',
            data: payload,
          })
        : apiClient.post('/analytics/events', payload);
      void request.catch((error) => {
        if (error.code === 'INVALID_ANALYTICS_CONTENT' && kind === 'page')
          void (
            token
              ? protectedRequest({
                  url: '/analytics/events',
                  method: 'post',
                  data: { ...payload, content: undefined },
                })
              : apiClient.post('/analytics/events', {
                  ...payload,
                  content: undefined,
                })
          ).catch(() => {});
      });
    }
    if (document.visibilityState !== 'hidden') send('page');
    const visible = () => {
      if (document.visibilityState !== 'hidden') send('page');
    };
    const playback = (event) => {
      if (
        !content ||
        !['cinema', 'originals', 'podcasts', 'live', 'reviews'].includes(module)
      )
        return;
      playing.current = event.detail === 1;
      if (playing.current) send('playback');
      if (module === 'live') pulse.current?.();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('fdfs:playback', playback);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('fdfs:playback', playback);
    };
  }, [allowed, content, module, route, settings.analyticsOpen, status, token]);

  return <Realtime.Provider value={socket}>{children}</Realtime.Provider>;
}

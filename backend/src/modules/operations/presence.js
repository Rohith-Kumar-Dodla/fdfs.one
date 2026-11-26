import { z } from 'zod';
import { can } from '../../../../shared/admin.js';
import {
  deviceCategories,
  presenceDefaults,
  presenceModules,
} from '../../../../shared/operations.js';
import { AppError } from '../../utils/app-error.js';
import { slug } from '../films/schemas.js';
import { publicEvent } from '../live/events.js';

export const pulseInput = z
  .strictObject({
    browser: z.uuid().optional(),
    module: z.enum(presenceModules).optional(),
    device: z.enum(deviceCategories).default('unknown'),
    visible: z.boolean(),
    event: slug.optional(),
    playing: z.boolean().optional(),
  })
  .refine((data) => !data.event || data.module === 'live');
export const unauthorizedAnalytics = () =>
  new AppError(403, 'FORBIDDEN', 'Analytics access is restricted.');

export function createPresenceStore(settings = {}) {
  const options = { ...presenceDefaults, ...settings };
  const rows = new Map();
  const startedAt = Date.now();
  const remove = (id) => rows.delete(id);
  function prune(now = Date.now()) {
    for (const [id, entry] of rows)
      if (now - entry.seen >= options.staleMs) remove(id);
  }
  function update(id, value, now = Date.now()) {
    if (!rows.has(id) && rows.size >= options.maxConnections) {
      prune(now);
      if (rows.size >= options.maxConnections) return false;
    }
    rows.set(id, { ...value, seen: now });
    return true;
  }
  function snapshot(now = Date.now()) {
    prune(now);
    const eligible = [...rows].filter(
      ([, row]) =>
        row.visible || (row.module === 'live' && row.event && row.playing),
    );
    const authenticatedBrowsers = new Set(
      eligible.flatMap(([, row]) =>
        row.user && row.browser ? [row.browser] : [],
      ),
    );
    const users = new Set(),
      guests = new Set(),
      modules = new Map(),
      devices = new Map(),
      events = new Map();
    const add = (map, key, identity) => {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(identity);
    };
    for (const [id, row] of eligible) {
      if (!row.user && row.browser && authenticatedBrowsers.has(row.browser))
        continue;
      const identity = row.user ? 'u:' + row.user : 'g:' + (row.browser ?? id);
      (row.user ? users : guests).add(identity);
      add(modules, row.module, identity);
      add(devices, row.device, identity);
      if (row.event) add(events, row.event, identity);
    }
    const counts = (map) =>
      Object.fromEntries([...map].map(([key, set]) => [key, set.size]));
    return {
      available: true,
      initializing: now - startedAt < options.heartbeatMs,
      at: new Date(now),
      connections: rows.size,
      authenticated: users.size,
      estimatedGuests: guests.size,
      estimatedVisitors: users.size + guests.size,
      modules: counts(modules),
      devices: counts(devices),
      events: counts(events),
    };
  }
  return { options, update, remove, snapshot };
}

export function mountPresence(io, store, authenticate, available, logger) {
  const subscribers = new Map();
  const authorizeReader = async (socket) => {
    const user = await authenticate(socket);
    if (!user.emailVerifiedAt || !can(user, 'analytics'))
      throw unauthorizedAnalytics();
  };
  let checking = false;
  function bind(socket, handle) {
    let updates = 0;
    let pending = false;
    let windowStart = 0;
    handle('presence:pulse', pulseInput, async (input) => {
      const now = Date.now();
      if (now - windowStart >= 10000) {
        windowStart = now;
        updates = 0;
      }
      if (++updates > 6 || pending)
        throw new AppError(
          429,
          'PRESENCE_RATE_LIMIT',
          'Presence updates are temporarily limited.',
        );
      if (!input.module) {
        store.remove(socket.id);
        return { heartbeatMs: store.options.heartbeatMs };
      }
      pending = true;
      try {
        const user =
          socket.handshake.auth?.token === undefined
            ? undefined
            : await authenticate(socket);
        let event;
        if (input.event)
          event = await publicEvent(input.event)
            .then(({ slug }) => slug)
            .catch((error) => {
              if (error.status === 404) return undefined;
              throw error;
            });
        if (socket.connected)
          store.update(
            socket.id,
            { ...input, event, user: user?.publicId },
            now,
          );
        return { heartbeatMs: store.options.heartbeatMs };
      } catch (error) {
        store.remove(socket.id);
        throw error;
      } finally {
        pending = false;
      }
    });
    handle('ops:subscribe', z.strictObject({}), async () => {
      await authorizeReader(socket);
      if (socket.connected) subscribers.set(socket.id, socket);
      return store.snapshot();
    });
    handle('ops:unsubscribe', z.strictObject({}), () =>
      subscribers.delete(socket.id),
    );
    handle('notice:subscribe', z.strictObject({}), async () => {
      const user = await authenticate(socket);
      if (socket.connected) await socket.join('notice:' + user.publicId);
      return null;
    });
    socket.on('disconnect', () => {
      store.remove(socket.id);
      subscribers.delete(socket.id);
    });
  }
  const timer = setInterval(async () => {
    if (checking || !available()) return;
    checking = true;
    try {
      const snapshot = store.snapshot();
      const readers = [...subscribers.values()];
      for (let i = 0; i < readers.length; i += 25) {
        await Promise.all(
          readers.slice(i, i + 25).map(async (socket) => {
            try {
              await authorizeReader(socket);
              if (subscribers.has(socket.id))
                socket.emit('ops:presence', snapshot);
            } catch {
              subscribers.delete(socket.id);
              socket.emit('ops:revoked');
            }
          }),
        );
      }
    } catch {
      logger.warn('Presence broadcast failed');
    } finally {
      checking = false;
    }
  }, store.options.updateMs).unref();
  return {
    bind,
    close() {
      clearInterval(timer);
      subscribers.clear();
    },
    notice(user) {
      const room = 'notice:' + user;
      const members = io.sockets.adapter.rooms.get(room);
      if (!members) return;
      for (const id of members) {
        const socket = io.sockets.sockets.get(id);
        if (!socket) continue;
        void authenticate(socket)
          .then((account) => {
            if (socket.connected && account.publicId === user)
              socket.emit('notice:changed');
          })
          .catch(() => {
            socket.leave(room);
          });
      }
    },
  };
}

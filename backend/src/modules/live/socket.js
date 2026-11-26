import { Server } from 'socket.io';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import { createSessionService } from '../auth/sessions.js';
import { slug } from '../films/schemas.js';
import { publicEvent } from './events.js';
import { chatSendInput, sendChat } from './chat.js';

const roomName = (slug) => 'live:' + slug;
const roomInput = z.strictObject({ slug });
const messageInput = chatSendInput.extend({ slug });

export function attachLiveSockets(
  server,
  { authConfig, origins, available, logger },
) {
  const sessions = createSessionService(authConfig);
  const io = new Server(server, {
    cors: { origin: origins },
    allowRequest(req, callback) {
      const origin = req.headers.origin;
      callback(null, !origin || origins.includes(origin));
    },
    maxHttpBufferSize: 8192,
  });
  const ready = () => {
    if (!available())
      throw new AppError(
        503,
        'DEPENDENCY_UNAVAILABLE',
        'Live services are temporarily unavailable.',
      );
  };
  const authenticate = async (socket) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length > 4096)
      throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    const { user } = await sessions.authenticate(token);
    if (user.status !== 'active')
      throw new AppError(
        403,
        'ACCOUNT_RESTRICTED',
        'This account is restricted.',
      );
    return user;
  };

  function errorView(error) {
    if (error instanceof AppError)
      return { code: error.code, message: error.message };
    logger.warn('Live socket operation failed');
    return {
      code: 'LIVE_ERROR',
      message: 'Live services could not complete this request.',
    };
  }

  io.use(async (socket, next) => {
    try {
      ready();
      if (socket.handshake.auth?.token !== undefined)
        await authenticate(socket);
      next();
    } catch (error) {
      const data = errorView(error);
      next(Object.assign(new Error(data.message), { data }));
    }
  });

  io.on('connection', (socket) => {
    let joined;
    let windowStart = 0;
    let operations = 0;
    let joining = false;
    const handle = (name, schema, operation) =>
      socket.on(name, async (input, ack) => {
        if (typeof ack !== 'function') return;
        try {
          const now = Date.now();
          if (now - windowStart >= 10000) {
            windowStart = now;
            operations = 0;
          }
          if (++operations > 20)
            throw new AppError(
              429,
              'SOCKET_RATE_LIMIT',
              'Wait before trying again.',
            );
          const parsed = schema.safeParse(input);
          if (!parsed.success)
            throw new AppError(
              400,
              'INVALID_SOCKET_PAYLOAD',
              'Invalid live request.',
            );
          ready();
          ack({ ok: true, data: await operation(parsed.data) });
        } catch (error) {
          ack({ ok: false, ...errorView(error) });
        }
      });

    handle('event:join', roomInput, async ({ slug }) => {
      if (joining)
        throw new AppError(
          409,
          'ROOM_BUSY',
          'Wait for the current room change.',
        );
      joining = true;
      try {
        const event = await publicEvent(slug);
        if (!socket.connected) return { slug };
        if (joined) await socket.leave(roomName(joined));
        await socket.join(roomName(slug));
        joined = slug;
        try {
          await publicEvent(slug);
        } catch (error) {
          await socket.leave(roomName(slug));
          joined = undefined;
          throw error;
        }
        return { slug, broadcast: event.broadcast };
      } finally {
        joining = false;
      }
    });
    handle('event:leave', roomInput, async ({ slug }) => {
      if (joined === slug) {
        await socket.leave(roomName(slug));
        joined = undefined;
      }
      return { slug };
    });
    handle('chat:send', messageInput, async ({ slug, ...message }) => {
      const room = roomName(slug);
      if (joining || joined !== slug || !socket.rooms.has(room))
        throw new AppError(
          403,
          'ROOM_REQUIRED',
          'Join the event before sending messages.',
        );
      const user = await authenticate(socket);
      if (!user.emailVerifiedAt)
        throw new AppError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Verify your email to send messages.',
        );
      const event = await publicEvent(slug);
      const sent = await sendChat(event._id, user, message);
      if (sent.message)
        io.to(room).emit('chat:message', { slug, ...sent.message });
      return { id: sent.id, duplicate: sent.duplicate };
    });
  });

  return {
    notify({ slug, status, removed }) {
      const room = io.to(roomName(slug));
      if (removed) room.emit('chat:removed', { slug, id: removed });
      else room.emit('live:state', { slug });
      if (status && status !== 'published') room.socketsLeave(roomName(slug));
    },
    close() {
      io.disconnectSockets(true);
      io.engine.close();
    },
  };
}

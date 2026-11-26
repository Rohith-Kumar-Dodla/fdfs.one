import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useRealtime } from '../operations/Realtime.jsx';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { control } from '../admin/common.jsx';
import { protectedRequest, refreshSession } from '../auth/api.js';
import { useAuthStore } from '../auth/state.js';

export function useLiveConnection(slug, account) {
  const token = useAuthStore((state) => state.accessToken);
  const client = useQueryClient();
  const socketRef = useRef(null);
  const socket = useRealtime();
  const [connection, setConnection] = useState('Connecting');
  const [incoming, setIncoming] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [attempt, reconnect] = useState(0);
  const activeToken = account?.status === 'active' ? token : null;
  useEffect(() => {
    if (!socket) return;
    const handlers = new Map();
    let disposed = false;
    const on = (name, callback) => {
      handlers.set(name, callback);
      socket.on(name, callback);
    };
    socketRef.current = socket;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['live', 'event', slug] });
      void client.invalidateQueries({ queryKey: ['live', 'history', slug] });
      void client.invalidateQueries({ queryKey: ['live', 'directory'] });
    };
    const join = async () => {
      setConnection('Joining chat');
      setIncoming([]);
      setRemoved([]);
      try {
        const result = await socket
          .timeout(5000)
          .emitWithAck('event:join', { slug });
        if (disposed || !socket.connected) return;
        setConnection(result.ok ? 'Connected' : result.message);
      } catch {
        if (!disposed && socket.connected) setConnection('Could not join chat');
      }
      if (!disposed) refresh();
    };
    on('connect', join);
    on('disconnect', () => setConnection('Disconnected. Reconnecting…'));
    on('connect_error', (error) => {
      setConnection(
        error.data?.message ?? 'Connection interrupted. Reconnecting…',
      );
      if (activeToken && error.data?.code === 'AUTH_REQUIRED')
        void refreshSession(activeToken).catch(() => {});
    });
    on('live:state', ({ slug: changed }) => {
      if (changed === slug) refresh();
    });
    on('chat:message', (message) => {
      if (message.slug === slug)
        setIncoming((rows) =>
          [...rows.filter(({ id }) => id !== message.id), message].slice(-100),
        );
    });
    on('chat:removed', ({ slug: changed, id }) => {
      if (changed !== slug) return;
      setIncoming((rows) => rows.filter((message) => message.id !== id));
      setRemoved((ids) => [...ids, id].slice(-100));
      void client.invalidateQueries({ queryKey: ['live', 'history', slug] });
    });
    on('chat:restored', ({ slug: changed, id }) => {
      if (changed !== slug) return;
      setRemoved((ids) => ids.filter((removed) => removed !== id));
      void client.invalidateQueries({ queryKey: ['live', 'history', slug] });
    });
    if (socket.connected) void join();
    return () => {
      disposed = true;
      if (socket.connected)
        socket.timeout(5000).emit('event:leave', { slug }, () => {});
      for (const [name, callback] of handlers) socket.off(name, callback);
      socketRef.current = null;
    };
  }, [activeToken, attempt, client, slug, socket]);
  async function send(payload) {
    if (!socketRef.current?.connected)
      throw new Error('Chat is disconnected. Try again after reconnecting.');
    const result = await socketRef.current
      .timeout(5000)
      .emitWithAck('chat:send', { slug, ...payload });
    if (activeToken && result.code === 'AUTH_REQUIRED') {
      await refreshSession(activeToken);
      throw new Error(
        'Your session was refreshed. Send your message again after reconnecting.',
      );
    }
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }
  return {
    connection,
    incoming,
    removed,
    send,
    retry: () => {
      if (socket && !socket.connected) socket.connect();
      reconnect((value) => value + 1);
    },
  };
}

export function LiveChat({ event, account, realtime }) {
  const { slug } = event;
  const [page, setPage] = useState();
  const [draft, setDraft] = useState('');
  const [reportId, setReportId] = useState(null);
  const retryId = useRef(null);
  const path = '/live/' + slug + '/chat';
  const history = useQuery({
    queryKey: ['live', 'history', slug, page],
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient
        .get(path, { params: { cursor: page }, signal })
        .then((response) => response.data),
  });
  const send = useMutation({
    mutationFn: realtime.send,
    onSuccess() {
      setDraft('');
      retryId.current = null;
    },
  });
  const report = useMutation({
    mutationFn: (reason) =>
      protectedRequest({
        url: path + '/reports',
        method: 'post',
        data: { messageId: reportId, reason },
      }),
    onSuccess: () => setReportId(null),
  });
  const verified =
    account?.status === 'active' && Boolean(account?.emailVerified);
  const rows = new Map(
    (history.data?.messages ?? []).map((row) => [row.id, row]),
  );
  if (!page) for (const row of realtime.incoming) rows.set(row.id, row);
  for (const id of realtime.removed) rows.delete(id);
  const messages = [...rows.values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-100);
  const connected = realtime.connection === 'Connected';
  return (
    <Card
      as="section"
      className="grid min-w-0 content-start gap-3"
      aria-label="Event chat"
    >
      <h2 className="text-xl font-semibold">Event chat</h2>
      <div className="flex flex-wrap items-center gap-x-3">
        <p role="status" className="text-sm text-muted">
          {realtime.connection}
        </p>
        {!connected && (
          <Button variant="outline" onClick={realtime.retry}>
            Reconnect
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {history.data?.cursor && (
          <Button
            variant="outline"
            onClick={() => setPage(history.data.cursor)}
          >
            Older messages
          </Button>
        )}
        {page && (
          <Button variant="outline" onClick={() => setPage(undefined)}>
            Recent messages
          </Button>
        )}
      </div>
      {history.isPending && (
        <p className="text-sm text-muted">Loading messages…</p>
      )}
      {history.isError && (
        <div role="alert">
          <p>{history.error.message}</p>
          <Button variant="outline" onClick={() => void history.refetch()}>
            Retry history
          </Button>
        </div>
      )}
      {history.isSuccess && messages.length === 0 && (
        <p className="text-sm text-muted">No messages yet.</p>
      )}
      <ol
        aria-label="Chat messages"
        className="max-h-[min(50dvh,28rem)] space-y-3 overflow-y-auto overscroll-contain"
      >
        {messages.map((message) => (
          <li
            key={message.id}
            className="border-b border-line pb-2 text-sm wrap-anywhere"
          >
            <p>
              <strong>{message.name}</strong>{' '}
              <time className="text-muted" dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </time>
            </p>
            <p className="whitespace-pre-wrap">{message.text}</p>
            {verified && (
              <button
                type="button"
                className="min-h-11 text-accent underline"
                onClick={() => {
                  report.reset();
                  setReportId(message.id);
                }}
              >
                Report message
              </button>
            )}
            {reportId === message.id && (
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  report.mutate(new FormData(e.currentTarget).get('reason'));
                }}
              >
                <label className="grid gap-1">
                  Report reason
                  <select className={control} name="reason">
                    <option value="harassment">Harassment</option>
                    <option value="spam">Spam</option>
                    <option value="inappropriate">Inappropriate content</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={report.isPending}>
                    Submit report
                  </Button>
                  <Button variant="outline" onClick={() => setReportId(null)}>
                    Cancel
                  </Button>
                </div>
                {report.isError && <p role="alert">{report.error.message}</p>}
              </form>
            )}
          </li>
        ))}
      </ol>
      {report.isSuccess && <p role="status">Report submitted.</p>}
      {event.broadcast === 'live' &&
        (verified ? (
          <form
            className="grid min-w-0 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              retryId.current ??= crypto.randomUUID();
              send.mutate({ clientId: retryId.current, text });
            }}
          >
            <label className="grid min-w-0 gap-1 text-sm">
              Chat message
              <input
                className={control}
                value={draft}
                maxLength={400}
                onChange={(e) => {
                  retryId.current = null;
                  setDraft(e.target.value);
                }}
              />
            </label>
            <Button
              type="submit"
              disabled={!connected || !draft.trim()}
              loading={send.isPending}
            >
              Send
            </Button>
            {send.isError && (
              <p role="alert" className="text-sm text-danger-text">
                {send.error.message}
              </p>
            )}
          </form>
        ) : (
          <p className="text-sm">
            {account ? (
              'Verify your email to send messages.'
            ) : (
              <Link
                to="/login"
                state={{ from: '/live/' + slug }}
                className="text-accent underline"
              >
                Sign in to send messages
              </Link>
            )}
          </p>
        ))}
    </Card>
  );
}

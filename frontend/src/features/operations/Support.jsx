import { useEffect, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  priorities,
  supportCategories,
  supportMaxBytes,
  ticketStatuses,
} from '../../../../shared/operations.js';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import {
  Card,
  Container,
  SectionHeading,
} from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { RecordFilters } from '../admin/ContentGrid.jsx';
import {
  control,
  date,
  DetailLink,
  readable,
  Records,
  useRecords,
} from '../admin/common.jsx';
import { protectedRequest, refreshSession } from '../auth/api.js';
import { useAuthStore } from '../auth/state.js';

const label = 'grid min-w-0 gap-1 text-sm';
const userPath = '/support/tickets';
const staffPath = '/admin/support/tickets';
const guestStorage = 'fdfs.support.guest';
const choices = (values) => values.map((value) => [value, readable(value)]);
const data = (response) => response.data;
const configKey = ['support-config'];

function useConfig() {
  return useQuery({
    queryKey: configKey,
    meta: { public: true },
    queryFn: ({ signal }) =>
      apiClient.get('/support/config', { signal }).then(data),
  });
}
function QueryFeedback({ query, children }) {
  if (query.isPending) return <Spinner label="Loading support" />;
  if (query.isError)
    return (
      <ErrorState
        title="Could not load support"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return children(query.data);
}
function Problem({ mutation }) {
  return mutation.isError ? (
    <p role="alert" className="text-sm text-danger-text">
      {mutation.error.message}
    </p>
  ) : null;
}
function Shell({ children, title }) {
  return (
    <Container className="grid min-w-0 gap-5 py-8 sm:py-12">
      <SectionHeading as="h1">{title}</SectionHeading>
      {children}
    </Container>
  );
}
function mutationRequest(url, method, data, guest, extras = {}) {
  const request = { url, method, data, ...extras };
  return guest
    ? apiClient.request({
        ...request,
        headers: { ...extras.headers, Authorization: 'Guest ' + guest.access },
      })
    : protectedRequest(request);
}
function signIn(to) {
  return (
    <Link
      className="inline-flex min-h-11 items-center text-accent underline"
      to="/login"
      state={{ from: to }}
    >
      Sign in
    </Link>
  );
}

function GuestRecovery({ config }) {
  const request = useMutation({
    mutationFn: (form) =>
      apiClient.post('/support/guest/start', {
        email: form.get('email').trim(),
        reference: form.get('reference').trim().toUpperCase(),
      }),
  });
  return (
    <Card className="grid gap-3">
      <h2 className="text-lg font-semibold">Access a guest ticket</h2>
      {!config.guestEmail ? (
        <p className="text-muted">
          Guest verification requires email delivery. Try again when it is
          available.
        </p>
      ) : (
        <form
          className="grid min-w-0 gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate(new FormData(event.currentTarget));
          }}
        >
          <label className={label}>
            Ticket reference
            <input
              name="reference"
              className={control}
              maxLength={19}
              required
            />
          </label>
          <label className={label}>
            Guest email
            <input
              name="email"
              className={control}
              type="email"
              required
              maxLength={254}
            />
          </label>
          <div>
            <Button type="submit" variant="outline" loading={request.isPending}>
              Email an access link
            </Button>
          </div>
          <Problem mutation={request} />
          {request.isSuccess && (
            <p role="status" className="text-sm text-muted">
              If the details match a guest ticket, check your email for an
              access link.
            </p>
          )}
        </form>
      )}
    </Card>
  );
}

export function SupportHome() {
  const config = useConfig();
  return (
    <Shell title="Support Center">
      <p className="text-muted">
        Get help with your account, playback, live events, or content. Track
        replies in your ticket.
      </p>
      <QueryFeedback query={config}>
        {(value) => (
          <>
            <div className="flex flex-wrap gap-x-4">
              {value.enabled && (
                <DetailLink to="/support/new">
                  Create a support ticket
                </DetailLink>
              )}
              <DetailLink to={userPath}>My tickets</DetailLink>
            </div>
            {!value.enabled && (
              <p role="status">New tickets are temporarily unavailable.</p>
            )}
            {value.contact && <p className="wrap-anywhere">{value.contact}</p>}
            {value.email && (
              <a
                className="text-accent underline wrap-anywhere"
                href={'mailto:' + value.email}
              >
                {value.email}
              </a>
            )}
            <GuestRecovery config={value} />
          </>
        )}
      </QueryFeedback>
    </Shell>
  );
}

export function NewTicket() {
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  const config = useConfig();
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = useRef(null);
  const create = useMutation({
    mutationFn: async (form) => {
      key.current ??= crypto.randomUUID();
      const ticket = {
        subject: form.get('subject').trim(),
        description: form.get('description').trim(),
        category: form.get('category'),
        urgency: form.get('urgency').trim() || undefined,
        clientId: key.current,
      };
      if (!authenticated)
        return apiClient.post('/support/guest/start', {
          email: form.get('email').trim(),
          ticket,
        });
      return protectedRequest({ url: userPath, method: 'post', data: ticket });
    },
    onSuccess(response) {
      void client.invalidateQueries({ queryKey: [userPath] });
      if (authenticated) navigate(userPath + '/' + response.data.id);
    },
  });
  return (
    <Shell title="Create a support ticket">
      <DetailLink to="/support">Back to support</DetailLink>
      <QueryFeedback query={config}>
        {(value) =>
          !value.enabled ? (
            <EmptyState title="New tickets are temporarily unavailable" />
          ) : !authenticated && !value.guestEmail ? (
            <EmptyState
              title="Guest verification is unavailable"
              description="Sign in to submit a ticket while email verification is unavailable."
            >
              {signIn('/support/new')}
            </EmptyState>
          ) : create.isSuccess && !authenticated ? (
            <Card>
              <p role="status">
                Check your email for a verification link. Your ticket is created
                after you verify.
              </p>
            </Card>
          ) : (
            <Card className="min-w-0">
              {!authenticated && (
                <p className="mb-3 text-sm text-muted">
                  Verify your email to open a guest ticket.{' '}
                  {signIn('/support/new')}
                </p>
              )}
              <form
                className="grid min-w-0 gap-3"
                onChange={() => {
                  key.current = null;
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  create.mutate(new FormData(event.currentTarget));
                }}
              >
                {!authenticated && (
                  <label className={label}>
                    Email address
                    <input
                      name="email"
                      type="email"
                      required
                      className={control}
                      maxLength={254}
                    />
                  </label>
                )}
                <label className={label}>
                  Issue category
                  <select name="category" required className={control}>
                    {value.categories.map((key) => (
                      <option value={key} key={key}>
                        {supportCategories[key]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label}>
                  Subject
                  <input
                    name="subject"
                    required
                    minLength={5}
                    maxLength={140}
                    className={control}
                  />
                </label>
                <label className={label}>
                  Description
                  <textarea
                    name="description"
                    required
                    minLength={10}
                    maxLength={6000}
                    rows={6}
                    className={control}
                  />
                </label>
                <label className={label}>
                  Urgency details (optional)
                  <input name="urgency" maxLength={300} className={control} />
                </label>
                <p className="text-sm text-muted">
                  Include what happened and when. Keep passwords and
                  verification codes out of your request.
                </p>
                <div>
                  <Button loading={create.isPending} type="submit">
                    {authenticated ? 'Create ticket' : 'Send verification link'}
                  </Button>
                </div>
                <Problem mutation={create} />
              </form>
            </Card>
          )
        }
      </QueryFeedback>
    </Shell>
  );
}

const fields = (staff) => [
  {
    title: 'Ticket',
    render: (row) => (
      <DetailLink to={(staff ? '/admin/support/' : userPath + '/') + row.id}>
        {row.subject}
      </DetailLink>
    ),
  },
  { title: 'Reference', render: (row) => row.reference },
  { title: 'Category', render: (row) => supportCategories[row.category] },
  { title: 'Status', render: (row) => readable(row.status) },
  ...(staff
    ? [{ title: 'Priority', render: (row) => readable(row.priority) }]
    : []),
  { title: 'Updated', render: (row) => date(row.updatedAt) },
];

function TicketList({ staff }) {
  const records = useRecords(staff ? staffPath : userPath);
  const stats = useQuery({
    queryKey: ['support-stats'],
    enabled: staff,
    queryFn: ({ signal }) =>
      protectedRequest({ url: '/admin/support/stats', signal }).then(data),
    refetchInterval: 30000,
  });
  return (
    <>
      {staff ? (
        <SectionHeading as="h1">Support tickets</SectionHeading>
      ) : (
        <DetailLink to="/support/new">Create a support ticket</DetailLink>
      )}
      {staff && (
        <dl className="flex flex-wrap gap-x-4 gap-y-2 rounded-panel border border-line bg-surface px-4 py-3 text-sm">
          <div>
            <dt className="text-muted">Open queue</dt>
            <dd>
              {stats.data?.open ??
                (stats.isPending ? 'Loading…' : 'Unavailable')}
            </dd>
          </div>
          {stats.data?.statuses &&
            ticketStatuses.map((key) => (
              <div key={key}>
                <dt className="capitalize text-muted">{readable(key)}</dt>
                <dd>{stats.data.statuses[key] ?? 0}</dd>
              </div>
            ))}
        </dl>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          records.filter(
            'q',
            new FormData(event.currentTarget).get('q').trim(),
          );
        }}
      >
        <label className={label}>
          Search subject or reference
          <input name="q" maxLength={80} className={control} />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <div>
        <RecordFilters
          records={records}
          fields={[
            ['status', 'Status', choices(ticketStatuses)],
            ['category', 'Category', Object.entries(supportCategories)],
            ...(staff
              ? [
                  ['priority', 'Priority', choices(priorities)],
                  [
                    'assignment',
                    'Assignment',
                    [
                      ['mine', 'Assigned to me'],
                      ['unassigned', 'Unassigned'],
                      ['assigned', 'Assigned'],
                    ],
                  ],
                ]
              : []),
          ]}
        />
      </div>
      <Records
        records={records}
        columns={fields(staff)}
        label="Support tickets"
        empty="No tickets found"
      />
    </>
  );
}

export function UserTickets() {
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  return (
    <Shell title="My support tickets">
      {authenticated ? (
        <TicketList />
      ) : (
        <EmptyState title="Sign in to view your tickets">
          {signIn(userPath)}
          <DetailLink to="/support">Access a guest ticket</DetailLink>
        </EmptyState>
      )}
    </Shell>
  );
}
export function StaffTickets() {
  return <TicketList staff />;
}

function readGuest() {
  try {
    const record = JSON.parse(sessionStorage.getItem(guestStorage));
    if (record?.access && Date.parse(record.expiresAt) > Date.now())
      return record;
  } catch {
    /* Treat inaccessible storage as a missing guest session. */
  }
  return null;
}
export function GuestTicket() {
  const { hash, pathname } = useLocation();
  const [token, setToken] = useState(() =>
    new URLSearchParams(hash.slice(1)).get('token'),
  );
  const [guest, saveGuest] = useState(readGuest);
  const verify = useMutation({
    mutationFn: () =>
      apiClient.post('/support/guest/verify', { token }).then(data),
    onSuccess(record) {
      const session = {
        access: record.access,
        id: record.ticket.id,
        expiresAt: record.expiresAt,
      };
      try {
        sessionStorage.setItem(guestStorage, JSON.stringify(session));
      } catch {
        /* Keep this session in memory. */
      }
      saveGuest(session);
      setToken(null);
    },
  });
  useEffect(() => {
    if (hash) history.replaceState(history.state, '', pathname);
  }, [hash, pathname]);
  return (
    <Shell title="Guest support">
      {token ? (
        <Card className="grid gap-3">
          <p>Verify this email link to open your ticket.</p>
          <div>
            <Button loading={verify.isPending} onClick={() => verify.mutate()}>
              Verify support link
            </Button>
          </div>
          <Problem mutation={verify} />
        </Card>
      ) : guest ? (
        <Conversation id={guest.id} guest={guest} />
      ) : (
        <EmptyState title="No active guest access">
          <DetailLink to="/support">Request a new access link</DetailLink>
        </EmptyState>
      )}
    </Shell>
  );
}

async function attachmentBlob(url, guest, signal) {
  const endpoint = apiClient.defaults.baseURL.replace(/\/$/, '') + url;
  const initial = useAuthStore.getState();
  const fetchFile = (authorization) =>
    fetch(endpoint, {
      headers: { Authorization: authorization },
      cache: 'no-store',
      signal,
    });
  let response = await fetchFile(
    guest ? 'Guest ' + guest.access : 'Bearer ' + initial.accessToken,
  );
  if (
    response.status === 401 &&
    !guest &&
    initial.accessToken &&
    !signal.aborted
  ) {
    const token = await refreshSession(initial.accessToken);
    if (useAuthStore.getState().generation === initial.generation)
      response = await fetchFile('Bearer ' + token);
  }
  if (
    !response.ok ||
    response.headers.get('content-type')?.split(';')[0] !== 'image/webp'
  )
    throw new Error('This private screenshot is unavailable.');
  return response.blob();
}

function PrivateImage({ path, asset, guest }) {
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let object;
    attachmentBlob(path + '/attachments/' + asset.id, guest, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          object = URL.createObjectURL(blob);
          setPreview(object);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => {
      controller.abort();
      if (object) URL.revokeObjectURL(object);
    };
  }, [asset.id, guest, open, path]);
  return (
    <div className="grid min-w-0 gap-2">
      <div>
        <Button
          variant="outline"
          onClick={() => {
            setPreview(null);
            setError('');
            setOpen(!open);
          }}
        >
          {open ? 'Close screenshot' : 'Preview screenshot'} · {asset.width}×
          {asset.height}
        </Button>
      </div>
      {open &&
        (error ? (
          <p role="alert">{error}</p>
        ) : preview ? (
          <img
            className="max-h-96 max-w-full object-contain"
            alt="Private support screenshot"
            src={preview}
          />
        ) : (
          <Spinner label="Loading screenshot" />
        ))}
    </div>
  );
}

function StaffControls({ ticket, update }) {
  const staff = useRecords('/admin/support/assignees', { limit: 10 });
  return (
    <Card className="grid min-w-0 gap-4">
      <h2 className="text-lg font-semibold">Manage ticket</h2>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          update.mutate({
            action: 'status',
            status: form.get('status'),
            resolution: form.get('resolution').trim() || undefined,
          });
        }}
      >
        <label className={label}>
          Change status
          <select
            name="status"
            className={control}
            defaultValue={ticket.status}
          >
            {ticketStatuses.map((status) => (
              <option key={status} value={status}>
                {readable(status)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Resolution summary
          <input
            name="resolution"
            maxLength={1500}
            className={control}
            defaultValue={ticket.resolution}
          />
        </label>
        <div>
          <Button type="submit" variant="outline" loading={update.isPending}>
            Save status
          </Button>
        </div>
      </form>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate({
            action: 'priority',
            priority: new FormData(event.currentTarget).get('priority'),
          });
        }}
      >
        <label className={label}>
          Ticket priority
          <select
            name="priority"
            className={control}
            defaultValue={ticket.priority}
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {readable(priority)}
              </option>
            ))}
          </select>
        </label>
        <div className="self-end">
          <Button type="submit" variant="outline" loading={update.isPending}>
            Save priority
          </Button>
        </div>
      </form>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          staff.filter(
            'q',
            new FormData(event.currentTarget).get('staff').trim(),
          );
        }}
      >
        <label className={label}>
          Find support staff
          <input name="staff" className={control} maxLength={80} />
        </label>
        <Button type="submit" variant="outline">
          Search staff
        </Button>
      </form>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate({
            action: 'assign',
            assigned: new FormData(event.currentTarget).get('assigned') || null,
          });
        }}
      >
        <label className={label}>
          Staff assignment
          <select
            name="assigned"
            className={control}
            defaultValue={ticket.assigned ?? ''}
          >
            <option value="">Unassigned</option>
            {ticket.assigned &&
              !staff.query.data?.data.some(
                (row) => row.id === ticket.assigned,
              ) && <option value={ticket.assigned}>Current assignee</option>}
            {staff.query.data?.data.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <div className="self-end">
          <Button type="submit" variant="outline" loading={update.isPending}>
            Save assignment
          </Button>
        </div>
      </form>
      {staff.query.isError && (
        <ErrorState
          title="Could not load support staff"
          description={staff.query.error.message}
          onRetry={() => void staff.query.refetch()}
        />
      )}
      <Problem mutation={update} />
    </Card>
  );
}

function TicketHistory({ path, revision }) {
  const [page, setPage] = useState(1);
  const url = path + '/audit';
  const history = useQuery({
    queryKey: ['support-tickets', url, revision, page],
    queryFn: ({ signal }) =>
      protectedRequest({ url, params: { page }, signal }),
  });
  return (
    <Card className="grid min-w-0 gap-3">
      <h2 className="text-lg font-semibold">Staff activity</h2>
      <QueryFeedback query={history}>
        {({ data, pagination }) =>
          data.length ? (
            <>
              <ul className="grid gap-2">
                {data.map((entry) => (
                  <li key={entry.id} className="text-sm wrap-anywhere">
                    {readable(entry.action.replace('support.', ''))} ?{' '}
                    {date(entry.createdAt)} ? Staff {entry.actorId}
                    {(entry.from || entry.to) && (
                      <p>
                        {entry.from ? readable(entry.from) : 'None'} ?{' '}
                        {entry.to ? readable(entry.to) : 'None'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
              />
            </>
          ) : (
            <p className="text-sm text-muted">No staff activity recorded.</p>
          )
        }
      </QueryFeedback>
    </Card>
  );
}

function Conversation({ id, guest, staff }) {
  const path = (staff ? staffPath : userPath) + '/' + id;
  const client = useQueryClient();
  const key = ['support-tickets', path, Boolean(guest)];
  const config = useConfig();
  const [page, setPage] = useState(1);
  const replyId = useRef(null);
  const request = (suffix, method, data, extras) =>
    mutationRequest(path + suffix, method, data, guest, extras);
  const ticket = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      request('', 'get', undefined, { signal }).then(data),
    refetchInterval: 30000,
  });
  const messages = useQuery({
    queryKey: [...key, 'messages', page],
    enabled: ticket.isSuccess,
    queryFn: ({ signal }) =>
      request('/messages', 'get', undefined, { params: { page }, signal }),
    refetchInterval: 30000,
  });
  function refresh() {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: ['support-stats'] });
    void client.invalidateQueries({ queryKey: [staff ? staffPath : userPath] });
  }
  const reply = useMutation({
    mutationFn: ({ text, internal }) => {
      replyId.current ??= crypto.randomUUID();
      return request('/messages', 'post', {
        text,
        internal,
        clientId: replyId.current,
      });
    },
    onSuccess() {
      replyId.current = null;
      setPage(1);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (fields) =>
      request('', 'patch', { ...fields, revision: ticket.data.revision }),
    onSuccess(result) {
      client.setQueryData(key, { ...ticket.data, ...result.data });
      refresh();
    },
  });
  const upload = useMutation({
    mutationFn: (file) => {
      if (!file?.size || file.size > (config.data?.maxBytes ?? supportMaxBytes))
        throw new Error('Select an image within the upload limit.');
      return request('/attachments', 'post', file, {
        headers: { 'Content-Type': file.type },
      });
    },
    onSuccess: refresh,
  });
  return (
    <QueryFeedback query={ticket}>
      {(row) => (
        <div className="grid min-w-0 gap-4">
          <Card className="grid min-w-0 gap-2 wrap-anywhere">
            <h2 className="text-xl font-semibold">{row.subject}</h2>
            <p className="text-sm text-muted">
              {row.reference} · {supportCategories[row.category]} ·{' '}
              {readable(row.status)} · {readable(row.priority)}
            </p>
            <p className="whitespace-pre-wrap">{row.description}</p>
            {row.urgency && <p>Urgency · {row.urgency}</p>}
            {row.resolution && (
              <p className="whitespace-pre-wrap">
                Resolution · {row.resolution}
              </p>
            )}
            {staff && (
              <p className="text-sm text-muted">Requester · {row.requester}</p>
            )}
          </Card>
          {staff && <StaffControls ticket={row} update={update} />}
          {staff && <TicketHistory path={path} revision={row.revision} />}
          <Card className="grid min-w-0 gap-3">
            <h2 className="text-lg font-semibold">Conversation</h2>
            <QueryFeedback query={messages}>
              {(result) =>
                result.data.length === 0 ? (
                  <p className="text-sm text-muted">No replies yet.</p>
                ) : (
                  <ol className="grid gap-3">
                    {[...result.data].reverse().map((message) => (
                      <li
                        className="border-b border-line pb-3 wrap-anywhere"
                        key={message.id}
                      >
                        <p className="text-sm text-muted">
                          {message.kind === 'note'
                            ? 'Internal note'
                            : message.sender === 'staff'
                              ? 'Support'
                              : message.sender === 'user'
                                ? 'Requester'
                                : 'Status update'}{' '}
                          · {date(message.createdAt)}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {message.kind === 'transition'
                            ? readable(message.from) +
                              ' → ' +
                              readable(message.to)
                            : message.text}
                        </p>
                      </li>
                    ))}
                  </ol>
                )
              }
            </QueryFeedback>
            {messages.data && (
              <Pagination
                page={page}
                totalPages={messages.data.pagination.totalPages}
                onPageChange={setPage}
              />
            )}
            {['resolved', 'closed'].includes(row.status) ? (
              !staff &&
              row.resolvedAt &&
              Date.now() - Date.parse(row.resolvedAt) < 30 * 86400000 && (
                <div>
                  <Button
                    variant="outline"
                    loading={update.isPending}
                    onClick={() =>
                      update.mutate({ action: 'status', status: 'open' })
                    }
                  >
                    Request reopening
                  </Button>
                  <Problem mutation={update} />
                </div>
              )
            ) : (
              <form
                className="grid gap-2"
                onChange={() => {
                  replyId.current = null;
                }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const values = new FormData(form);
                  reply.mutate(
                    {
                      text: values.get('message').trim(),
                      internal: values.has('internal'),
                    },
                    { onSuccess: () => form.reset() },
                  );
                }}
              >
                <label className={label}>
                  Reply
                  <textarea
                    name="message"
                    required
                    maxLength={6000}
                    rows={4}
                    className={control}
                  />
                </label>
                {staff && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input name="internal" type="checkbox" />
                    Internal note, visible to support staff
                  </label>
                )}
                <div>
                  <Button type="submit" loading={reply.isPending}>
                    Send message
                  </Button>
                </div>
                <Problem mutation={reply} />
              </form>
            )}
          </Card>
          {(row.attachments.length > 0 || config.data?.attachments) && (
            <Card className="grid min-w-0 gap-3">
              <h2 className="text-lg font-semibold">Private screenshots</h2>
              {row.attachments.map((asset) => (
                <PrivateImage
                  key={asset.id}
                  path={path}
                  asset={asset}
                  guest={guest}
                />
              ))}
              {config.data?.attachments &&
                row.attachments.length < config.data.maxImages &&
                !['closed', 'resolved'].includes(row.status) && (
                  <form
                    className="grid min-w-0 gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      upload.mutate(new FormData(form).get('image'), {
                        onSuccess: () => form.reset(),
                      });
                    }}
                  >
                    <label className={label}>
                      Attach screenshot
                      <input
                        name="image"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        required
                        className={control}
                      />
                    </label>
                    <p className="text-sm text-muted">
                      Up to {config.data.maxImages} images,{' '}
                      {Math.round(config.data.maxBytes / 1048576)} MiB each.
                      Screenshots expire after {config.data.attachmentDays}{' '}
                      days.
                    </p>
                    <div>
                      <Button
                        type="submit"
                        variant="outline"
                        loading={upload.isPending}
                      >
                        Upload screenshot
                      </Button>
                    </div>
                    <Problem mutation={upload} />
                  </form>
                )}
            </Card>
          )}
        </div>
      )}
    </QueryFeedback>
  );
}

export function TicketDetail({ staff = false }) {
  const { id } = useParams();
  const status = useAuthStore((state) => state.status);
  if (staff)
    return (
      <>
        <DetailLink to="/admin/support">Back to support tickets</DetailLink>
        <SectionHeading as="h1">Support ticket</SectionHeading>
        <Conversation key={id} id={id} staff />
      </>
    );
  return (
    <Shell title="Support ticket">
      <DetailLink to={userPath}>Back to my tickets</DetailLink>
      {status === 'authenticated' ? (
        <Conversation key={id} id={id} />
      ) : status === 'checking' ? (
        <Spinner label="Checking your account" />
      ) : (
        signIn(userPath + '/' + id)
      )}
    </Shell>
  );
}

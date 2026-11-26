import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { apiClient } from '../../api/client.js';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Select, Textarea } from '../../components/ui/fields.jsx';
import { Pagination } from '../../components/ui/Pagination.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import {
  EmptyState,
  ErrorState,
  Spinner,
} from '../../components/ui/states.jsx';
import { useChange } from '../admin/common.jsx';
import { protectedRequest } from '../auth/api.js';
import { useAccount } from '../auth/guards.jsx';
import { useAuthStore } from '../auth/state.js';

const changes = [
  'podcast-comments',
  '/admin/podcasts/comments',
  '/admin/podcasts/reports',
];

function CommentText({ initial = '', onSubmit, loading, label }) {
  return (
    <form
      className="grid min-w-0 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        onSubmit(new FormData(form).get('text'), form);
      }}
    >
      <label className="grid min-w-0 gap-1 text-sm">
        Comment text
        <Textarea
          name="text"
          rows={3}
          minLength={2}
          maxLength={1500}
          required
          defaultValue={initial}
        />
      </label>
      <div>
        <Button type="submit" loading={loading}>
          {label}
        </Button>
      </div>
    </form>
  );
}

export function EpisodeComments({ slug }) {
  const account = useAccount();
  const location = useLocation();
  const authenticated = useAuthStore(
    (state) => state.status === 'authenticated',
  );
  const generation = useAuthStore((state) => state.generation);
  const allowed =
    authenticated &&
    account.data?.emailVerified &&
    account.data?.status === 'active';
  const [page, pageTo] = useState(1);
  const [action, setAction] = useState(null);
  const [notice, setNotice] = useState('');
  const path = '/podcasts/episodes/' + slug + '/comments';
  const request = { url: path, params: { page, limit: 10 } };
  const list = useQuery({
    queryKey: [
      'podcast-comments',
      slug,
      page,
      authenticated ? generation : 'public',
    ],
    meta: { public: !authenticated },
    queryFn: ({ signal }) =>
      authenticated
        ? protectedRequest({ ...request, signal })
        : apiClient.get(path, { params: request.params, signal }),
  });
  const mutation = useChange(changes);
  function send(method, url, data, completed) {
    mutation.mutate(
      { method, url, data },
      {
        onSuccess: () => {
          setAction(null);
          setNotice(completed);
        },
      },
    );
  }
  function open(kind, comment) {
    mutation.reset();
    setNotice('');
    setAction({ kind, comment });
  }
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="episode-comments">
      <h2 id="episode-comments" className="text-xl font-semibold">
        Comments
      </h2>
      {allowed ? (
        <CommentText
          label="Post comment"
          loading={mutation.isPending}
          onSubmit={(text, form) => {
            mutation.reset();
            setNotice('');
            mutation.mutate(
              { method: 'post', url: path, data: { text } },
              {
                onSuccess: () => {
                  form.reset();
                  pageTo(1);
                  setNotice('Comment posted.');
                },
              },
            );
          }}
        />
      ) : (
        <p className="text-sm text-muted">
          {authenticated ? (
            <Link
              to="/verification-pending"
              className="inline-flex min-h-11 items-center text-accent underline"
            >
              Verify your email to comment
            </Link>
          ) : (
            <Link
              to="/login"
              state={{ from: location.pathname }}
              className="inline-flex min-h-11 items-center text-accent underline"
            >
              Sign in to comment
            </Link>
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {mutation.isError && !action && (
        <p role="alert" className="text-danger-text">
          {mutation.error.message}
        </p>
      )}
      {list.isPending && <Spinner label="Loading comments" />}
      {list.isError && (
        <ErrorState
          title="Could not load comments"
          description={list.error.message}
          onRetry={() => void list.refetch()}
        />
      )}
      {list.data && (
        <>
          {list.data.data.length === 0 && (
            <EmptyState title="No comments on this page" />
          )}
          {page > 1 && list.data.data.length === 0 && (
            <div>
              <Button variant="outline" onClick={() => pageTo(1)}>
                Return to first page
              </Button>
            </div>
          )}
          <ul className="grid gap-3">
            {list.data.data.map((entry) => (
              <Card
                key={entry.id}
                as="li"
                className="grid min-w-0 gap-2 wrap-anywhere"
              >
                <p className="font-semibold">{entry.author}</p>
                <p className="text-sm text-muted">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.editedAt && ' · Edited'}
                </p>
                <p className="whitespace-pre-wrap">{entry.text}</p>
                {allowed && (
                  <div className="flex flex-wrap gap-2">
                    {entry.mine ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => open('edit', entry)}
                        >
                          Edit comment
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => open('delete', entry)}
                        >
                          Delete comment
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => open('report', entry)}
                      >
                        Report comment
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={list.data.pagination.totalPages}
            onPageChange={pageTo}
          />
        </>
      )}
      <Dialog
        open={Boolean(action)}
        onClose={() => {
          if (!mutation.isPending) setAction(null);
        }}
        title={
          action?.kind === 'delete'
            ? 'Delete comment?'
            : action?.kind === 'report'
              ? 'Report comment'
              : 'Edit comment'
        }
      >
        {action?.kind === 'edit' && (
          <CommentText
            key={action.comment.id}
            initial={action.comment.text}
            loading={mutation.isPending}
            label="Save edit"
            onSubmit={(text) =>
              send(
                'patch',
                path + '/' + action.comment.id,
                { text },
                'Comment updated.',
              )
            }
          />
        )}
        {action?.kind === 'delete' && (
          <Button
            loading={mutation.isPending}
            onClick={() =>
              send(
                'delete',
                path + '/' + action.comment.id,
                undefined,
                'Comment deleted.',
              )
            }
          >
            Confirm deletion
          </Button>
        )}
        {action?.kind === 'report' && (
          <form
            className="grid min-w-0 gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              send(
                'post',
                path + '/' + action.comment.id + '/report',
                {
                  reason: form.get('reason'),
                  details: form.get('details').trim() || undefined,
                },
                'Report sent.',
              );
            }}
          >
            <label className="grid gap-1 text-sm">
              Reason
              <Select name="reason" required>
                <option value="">Choose a reason</option>
                <option value="spam">Spam</option>
                <option value="harassment">Harassment</option>
                <option value="inappropriate">Inappropriate content</option>
                <option value="other">Other</option>
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              Details (optional)
              <Textarea name="details" rows={3} maxLength={500} />
            </label>
            <div>
              <Button type="submit" loading={mutation.isPending}>
                Send report
              </Button>
            </div>
          </form>
        )}
        {mutation.isError && (
          <p role="alert" className="mt-3 text-danger-text">
            {mutation.error.message}
          </p>
        )}
      </Dialog>
    </section>
  );
}

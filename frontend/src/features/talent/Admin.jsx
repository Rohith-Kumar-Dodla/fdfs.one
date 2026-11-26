import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { can } from '../../../../shared/admin.js';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { professions } from '../../../../shared/talent.js';
import { Button } from '../../components/ui/Button.jsx';
import { TextInput } from '../../components/ui/fields.jsx';
import { Badge, Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  ConfirmAction,
  control,
  DetailLink,
  get,
  QueryState,
  Records,
  Select,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import { TalentForm } from './Form.jsx';
import { professionOptions, ProfileContent, TalentImage } from './Public.jsx';

const base = '/admin/talent';
const invalidationKeys = [
  base,
  'talent',
  '/admin/audit',
  '/admin/overview',
  'site-homepage',
];
const columns = [
  {
    title: 'Name',
    render: (profile) => (
      <DetailLink to={profile.id}>{profile.displayName}</DetailLink>
    ),
  },
  {
    title: 'Professions',
    render: (profile) =>
      profile.professions.map((role) => professions[role]).join(', '),
  },
  {
    title: 'Status',
    render: (profile) => (
      <Badge tone={profile.status === 'published' ? 'success' : 'neutral'}>
        {profile.status}
      </Badge>
    ),
  },
];
const states = ['draft', 'published', 'archived'];

export function AdminTalentList() {
  const records = useRecords(base);
  return (
    <>
      <SectionHeading as="h1">Talent Profiles</SectionHeading>
      <div className="flex flex-wrap items-center gap-x-5">
        <DetailLink to={base + '/new'}>Create a profile</DetailLink>
        <DetailLink to="/admin/submissions?category=talent">
          Review talent submissions
        </DetailLink>
      </div>
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
        <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm">
          Search by name
          <input type="search" name="q" maxLength={80} className={control} />
        </label>
        <Button type="submit">Search</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Profession"
          options={professionOptions}
          value={records.params.profession ?? ''}
          onChange={(value) => records.filter('profession', value)}
        />
        <Select
          label="Publication status"
          options={states.map((status) => [status, status])}
          value={records.params.status ?? ''}
          onChange={(value) => records.filter('status', value)}
        />
      </div>
      <Records
        records={records}
        columns={columns}
        label="Talent profiles"
        empty="No talent profiles found"
      />
    </>
  );
}

function ProfileActions({ profile }) {
  const account = useOutletContext();
  const [action, setAction] = useState(null);
  const change = useChange(invalidationKeys);
  const url = base + '/' + profile.id;
  function confirm(title, description, request) {
    change.reset();
    setAction({ title, description, request });
  }
  function changeStatus(action, title, description) {
    confirm(title, description, {
      url: url + '/status',
      method: 'post',
      data: { action, revision: profile.revision },
    });
  }
  function associate(userId) {
    confirm(
      userId ? 'Approve account association?' : 'Remove account association?',
      userId
        ? 'Confirm that the account holder is authorized to be associated with this profile.'
        : 'The account association will be removed.',
      {
        url: url + '/association',
        method: 'put',
        data: { userId, revision: profile.revision },
      },
    );
  }
  return (
    <>
      <Card className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Publication</h2>
        <div>
          <Badge>{profile.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile.status === 'draft' ? (
            <Button
              variant="outline"
              onClick={() =>
                changeStatus(
                  'publish',
                  'Publish profile?',
                  'The profile will appear in the public directory.',
                )
              }
            >
              Publish
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() =>
                changeStatus(
                  'unpublish',
                  'Unpublish profile?',
                  'The profile will return to draft.',
                )
              }
            >
              Unpublish
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              changeStatus(
                'archive',
                'Archive profile?',
                'The profile will become read-only and disappear from the directory.',
              )
            }
          >
            Archive
          </Button>
        </div>
        {profile.status === 'published' && (
          <DetailLink to={'/talent/' + profile.slug}>
            View public profile
          </DetailLink>
        )}
      </Card>
      <Card className="grid min-w-0 gap-3">
        <h2 className="text-lg font-semibold">Approved account association</h2>
        {can(account, 'users') && (
          <>
            {profile.associatedUserId && (
              <p className="wrap-anywhere text-sm text-muted">
                Current account {profile.associatedUserId}
              </p>
            )}
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                associate(
                  new FormData(event.currentTarget).get('account').trim(),
                );
              }}
            >
              <label className="grid min-w-0 gap-1 text-sm">
                Verified user account ID
                <TextInput
                  name="account"
                  required
                  minLength={36}
                  maxLength={36}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline">
                  Approve association
                </Button>
                {profile.associatedUserId && (
                  <Button variant="outline" onClick={() => associate(null)}>
                    Remove association
                  </Button>
                )}
              </div>
            </form>
            <DetailLink to="/admin/users">
              Find an account in user management
            </DetailLink>
          </>
        )}
      </Card>
      <ConfirmAction
        action={action}
        onClose={() => setAction(null)}
        change={change}
      />
    </>
  );
}

export function AdminNewTalent() {
  const navigate = useNavigate();
  const change = useChange(invalidationKeys, ({ data }) =>
    navigate(base + '/' + data.id),
  );
  return (
    <>
      <DetailLink to={base}>Back to Talent Profiles</DetailLink>
      <SectionHeading as="h1">Create talent profile</SectionHeading>
      <DetailLink to="/admin/media">Open media library</DetailLink>
      <TalentForm
        admin
        create
        change={change}
        label="Create draft"
        submit={(data) => change.mutate({ url: base, method: 'post', data })}
      />
    </>
  );
}

export function AdminTalentDetail() {
  const { id } = useParams();
  const url = base + '/' + id;
  const query = useQuery({
    queryKey: [base, id],
    queryFn: ({ signal }) => get(url, signal),
  });
  const change = useChange(invalidationKeys);
  return (
    <>
      <DetailLink to={base}>Back to Talent Profiles</DetailLink>
      <SectionHeading as="h1">Manage talent profile</SectionHeading>
      <QueryState query={query}>
        {(profile) => (
          <>
            <div className="min-w-0 wrap-anywhere">
              <h2 className="text-xl font-semibold">{profile.displayName}</h2>
              <p className="text-sm text-muted">Public slug · {profile.slug}</p>
            </div>
            {profile.status === 'archived' ? (
              <Card className="grid min-w-0 gap-4">
                <Badge>archived</Badge>
                <p className="mt-2 text-muted">
                  Archived profiles are read-only.
                </p>
                <TalentImage cover image={profile.coverImage} />
                <TalentImage image={profile.profileImage} />
                <p className="wrap-anywhere">{profile.introduction}</p>
                <ProfileContent profile={profile} />
              </Card>
            ) : (
              <>
                <ProfileActions profile={profile} />
                <DetailLink to="/admin/media">Open media library</DetailLink>
                <TalentForm
                  key={profile.id + '-' + profile.revision}
                  profile={profile}
                  admin
                  change={change}
                  submit={(data) =>
                    change.mutate({
                      url,
                      method: 'patch',
                      data: { ...data, revision: profile.revision },
                    })
                  }
                />
              </>
            )}
          </>
        )}
      </QueryState>
    </>
  );
}

import { CompactTalentForm } from '../admin/CompactCatalogueForms.jsx';
import {
  ContentGrid,
  ContentHeading,
  RecordFilters,
} from '../admin/ContentGrid.jsx';
import { talentCategories } from '../../../../shared/public-home.js';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { can } from '../../../../shared/admin.js';
import {
  Link,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import { professions } from '../../../../shared/talent.js';
import { Button, buttonClasses } from '../../components/ui/Button.jsx';
import { TextInput } from '../../components/ui/fields.jsx';
import { Badge, Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import {
  ConfirmAction,
  DetailLink,
  get,
  QueryState,
  useChange,
  useRecords,
} from '../admin/common.jsx';
import { TalentCredits } from './Credits.jsx';
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
const states = ['draft', 'published', 'archived'];
function useCategory() {
  const [params] = useSearchParams();
  const category = params.get('category');
  return Object.hasOwn(talentCategories, category) ? category : undefined;
}
export function AdminTalentList() {
  const category = useCategory();
  return category ? (
    <TalentGrid key={category} category={category} />
  ) : (
    <>
      <SectionHeading as="h1">Talent Profiles</SectionHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(talentCategories).map(([key, label]) => (
          <Card
            key={key}
            as="article"
            className="grid justify-items-start gap-3"
          >
            <h2 className="text-lg font-semibold">{label}</h2>
            <Link
              to={base + '?category=' + key}
              className={buttonClasses('outline')}
            >
              Manage Profiles
            </Link>
          </Card>
        ))}
      </div>
      <DetailLink to="/admin/submissions?category=talent">
        Review talent submissions
      </DetailLink>
    </>
  );
}
function TalentGrid({ category }) {
  const records = useRecords(base, { category });
  return (
    <>
      <DetailLink to={base}>Back to Talent Profiles</DetailLink>
      <ContentHeading
        title={talentCategories[category]}
        create={base + '/new?category=' + category}
        action="Create Profile"
      >
        <RecordFilters
          records={records}
          fields={[
            ['q', 'Search by name'],
            ['profession', 'Profession', professionOptions],
            [
              'status',
              'Publication status',
              states.map((status) => [status, status]),
            ],
          ]}
        />
      </ContentHeading>
      <ContentGrid
        records={records}
        empty="No talent profiles found"
        entry={(profile) => ({
          title: profile.displayName,
          image: profile.profileImage,
          meta: profile.professions.map((role) => professions[role]).join(', '),
          edit: base + '/' + profile.id,
          preview:
            profile.status === 'published'
              ? '/talent/' + profile.slug
              : base + '/' + profile.id + '#preview',
        })}
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
  const category = useCategory();
  if (!category) return <AdminTalentList />;
  return (
    <>
      <SectionHeading as="h1">Create Profile</SectionHeading>
      <CompactTalentForm category={category} />
    </>
  );
}

export function AdminTalentDetail() {
  const account = useOutletContext();
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
                <TalentCredits profile={profile} account={account} />
                <details id="preview" tabIndex={-1}>
                  <summary className="cursor-pointer py-2 font-semibold">
                    Preview profile
                  </summary>
                  <ProfileContent profile={profile} />
                </details>
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

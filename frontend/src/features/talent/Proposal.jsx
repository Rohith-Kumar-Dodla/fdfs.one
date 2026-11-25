import { useNavigate } from 'react-router';
import { DetailLink, useChange } from '../admin/common.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
import { SectionHeading } from '../../components/ui/surfaces.jsx';
import { TalentForm } from './Form.jsx';
import { usePublicTalent } from './Public.jsx';

export function TalentSubmission({ record, targetId, slug }) {
  const navigate = useNavigate();
  const target = usePublicTalent(slug);
  const base = '/submissions';
  const change = useChange([base], ({ data }) => {
    if (!record) navigate(base + '/' + data.id);
  });

  if (targetId && target.isPending && slug)
    return <Spinner label="Loading current talent profile" />;
  if (targetId && target.data?.id !== targetId)
    return (
      <ErrorState
        title="Talent profile unavailable"
        description="Open the published profile to propose a correction."
      />
    );
  const updateTarget = record?.proposal?.targetId ?? targetId ?? undefined;
  return (
    <>
      {!record && (
        <SectionHeading as="h1">
          {updateTarget
            ? 'Suggest a profile correction'
            : 'Suggest a talent profile'}
        </SectionHeading>
      )}
      {updateTarget && (
        <p className="wrap-anywhere text-sm text-muted">
          This correction will be reviewed before it changes the public profile.
        </p>
      )}
      <TalentForm
        profile={
          record?.proposal
            ? { ...record.proposal.profile, ...record.proposalImages }
            : target.data
        }
        change={change}
        label={record ? 'Save proposal changes' : 'Create proposal draft'}
        submit={(profile) =>
          change.mutate({
            url: record ? base + '/' + record.id : base,
            method: record ? 'patch' : 'post',
            data: {
              ...(!record && { category: 'talent' }),
              title:
                (updateTarget ? 'Talent correction · ' : 'Talent profile · ') +
                profile.displayName,
              summary: 'Proposed introduction · ' + profile.introduction,
              proposal: { targetId: updateTarget, profile },
            },
          })
        }
      />
      {!record && <DetailLink to="/talent">Back to Talent Profiles</DetailLink>}
    </>
  );
}

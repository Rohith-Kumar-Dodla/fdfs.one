import { useState } from 'react';
import { genres } from '../../../../shared/films.js';
import { reviewGenres } from '../../../../shared/reviews.js';
import { saveTypes } from '../../../../shared/personal.js';
import { sources } from '../../../../shared/homepage.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { Checkbox } from '../../components/ui/fields.jsx';
import { ErrorState, Spinner } from '../../components/ui/states.jsx';
import { usePersonal, usePersonalChange } from './api.js';

const explanations = [
  [
    'history',
    'Save playback history and resume',
    'Sync watching progress across your devices. Turning this off stops new collection and hides Continue Watching. Existing history can still be deleted.',
  ],
  [
    'recommendations',
    'Personalize recommendations',
    'Use your selected interests, watchlist, opted-in playback history, and followed talent to rank suggestions.',
  ],
  [
    'talentNotices',
    'Notify me about releases from followed talent',
    'Show relevant new releases in the Notification Center.',
  ],
];

function PreferenceForm({ saved }) {
  const [draft, setDraft] = useState(saved);
  const change = usePersonalChange();
  const toggle = (key, value) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  function options(label, key, choices) {
    return (
      <fieldset className="grid min-w-0 gap-1 sm:grid-cols-2">
        <legend className="font-semibold">{label}</legend>
        {choices.map(([value, title]) => (
          <label
            className="flex min-h-11 min-w-0 items-center gap-2 text-sm"
            key={value}
          >
            <Checkbox
              checked={draft[key].includes(value)}
              disabled={
                key === 'genres' &&
                draft.genres.length >= 12 &&
                !draft.genres.includes(value)
              }
              onChange={() => toggle(key, value)}
            />
            {title}
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <form
      className="grid min-w-0 gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        change.mutate({ path: '/preferences', method: 'patch', data: draft });
      }}
    >
      {explanations.map(([key, label, description]) => (
        <div className="grid gap-1" key={key}>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <Checkbox
              checked={draft[key]}
              aria-describedby={'pref-' + key}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.checked })
              }
            />
            {label}
          </label>
          <p id={'pref-' + key} className="text-sm text-muted">
            {description}
          </p>
        </div>
      ))}
      {options(
        'Preferred genres (up to 12)',
        'genres',
        Object.entries({ ...genres, ...reviewGenres }),
      )}
      {options(
        'Preferred content types',
        'types',
        saveTypes.map((module) => [module, sources[module].label]),
      )}
      <div>
        <Button type="submit" loading={change.isPending}>
          Save personalization settings
        </Button>
      </div>
      {change.isSuccess && (
        <p role="status" className="text-sm text-success">
          Personalization settings saved.
        </p>
      )}
      {change.isError && (
        <p role="alert" className="text-sm text-danger-text">
          {change.error.message}
        </p>
      )}
    </form>
  );
}
export function PersonalSettings() {
  const query = usePersonal('/preferences');
  return (
    <Card
      as="section"
      id="personalization"
      tabIndex={-1}
      className="grid min-w-0 scroll-mt-24 gap-4"
    >
      <h2 className="text-xl font-semibold">Personalization and privacy</h2>
      {query.isPending ? (
        <Spinner label="Loading personalization settings" />
      ) : query.isError ? (
        <ErrorState
          title="Could not load personalization settings"
          description={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <PreferenceForm saved={query.data} />
      )}
    </Card>
  );
}

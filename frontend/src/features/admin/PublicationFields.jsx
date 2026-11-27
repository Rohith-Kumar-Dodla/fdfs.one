import { useState } from 'react';
import { eventUtcTime } from '../../../../shared/live.js';
import { Checkbox, TextInput } from '../../components/ui/fields.jsx';

export function publicationValues(values) {
  if (!values.publishing || values.publishing === 'draft') return undefined;
  if (!values.playbackChecked)
    throw new Error(
      'Verify playback and embedding permissions before publishing.',
    );
  const releaseAt =
    values.publishing === 'schedule'
      ? eventUtcTime(values.scheduledAt, values.scheduleZone.trim())
      : undefined;
  if (releaseAt && Date.parse(releaseAt) <= Date.now())
    throw new Error('The scheduled release must be in the future.');
  return { playbackChecked: true, releaseAt };
}

export function PublicationFields({ register }) {
  const [mode, setMode] = useState('draft');
  const publishing = register('publishing');
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 font-semibold">Publication</legend>
      <label className="grid gap-1 text-sm">
        Publishing option
        <select
          {...publishing}
          defaultValue="draft"
          className="min-h-11 rounded-control border border-line bg-base px-3"
          onChange={(event) => {
            void publishing.onChange(event);
            setMode(event.target.value);
          }}
        >
          <option value="draft">Save Draft</option>
          <option value="now">Publish Now</option>
          <option value="schedule">Schedule</option>
        </select>
      </label>
      {mode === 'schedule' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-sm">
            Release date and time
            <TextInput
              type="datetime-local"
              required
              {...register('scheduledAt')}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Timezone (IANA)
            <TextInput
              required
              maxLength={64}
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
              {...register('scheduleZone')}
            />
          </label>
        </div>
      )}
      {mode !== 'draft' && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox required {...register('playbackChecked')} /> I verified
          playback in an authorized embed.
        </label>
      )}
    </fieldset>
  );
}

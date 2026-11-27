import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { DetailLink, get } from '../admin/common.jsx';
import { Button } from '../../components/ui/Button.jsx';
import {
  Checkbox,
  Select,
  TextInput,
  Textarea,
} from '../../components/ui/fields.jsx';
import { Card } from '../../components/ui/surfaces.jsx';
import { MediaPicker } from '../admin/MediaPicker.jsx';
import { ImageUpload, uploadImage } from '../media/Images.jsx';
import { talentCategories } from '../../../../shared/public-home.js';
import { linkKinds } from '../../../../shared/talent.js';
import { professionOptions, TalentImage } from './Public.jsx';

const allowedId =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const https = '[hH][tT][tT][pP][sS]://.+';
const optional = (value) => value?.trim() || undefined;

function Field({ label, children }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ImageField({ label, url, value, image, onChange, admin, cover }) {
  const [uploaded, setUploaded] = useState(null);
  const preview = [uploaded, image].find((asset) => asset?.id === value);
  return (
    <Card className="grid min-w-0 gap-3">
      <h3 className="font-semibold">{label}</h3>
      {preview && <TalentImage image={preview} cover={cover} />}
      {value && (
        <div>
          <Button variant="outline" onClick={() => onChange('')}>
            Remove {label.toLowerCase()}
          </Button>
        </div>
      )}
      {admin && (
        <Field label={label + ' media library ID'}>
          <TextInput
            value={value}
            maxLength={36}
            pattern={allowedId}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )}
      {admin && (
        <MediaPicker
          label={'Select ' + label.toLowerCase() + ' from library'}
          onSelect={(asset) => {
            setUploaded(asset);
            onChange(asset.id);
          }}
        />
      )}
      <ImageUpload
        label={'Choose ' + label.toLowerCase()}
        onUpload={async (file) => {
          const response = await uploadImage(url, file, 'post');
          setUploaded(response.data);
          onChange(response.data.id);
        }}
      />
    </Card>
  );
}

function AchievementFields({ fields, register, append, remove }) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-lg font-semibold">
        Achievements and recognitions
      </legend>
      {fields.map(({ id }, index) => (
        <Card key={id} className="grid min-w-0 gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Achievement title">
              <TextInput
                {...register('achievements.' + index + '.title')}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Organization">
              <TextInput
                {...register('achievements.' + index + '.organization')}
                maxLength={120}
              />
            </Field>
            <Field label="Year">
              <TextInput
                type="number"
                min={1800}
                max={2100}
                {...register('achievements.' + index + '.year')}
              />
            </Field>
            <Field label="Supporting source">
              <TextInput
                type="url"
                pattern={https}
                maxLength={2048}
                {...register('achievements.' + index + '.source')}
              />
            </Field>
          </div>
          <Field label="Achievement description">
            <Textarea
              maxLength={600}
              {...register('achievements.' + index + '.description')}
            />
          </Field>
          <div>
            <Button variant="outline" onClick={() => remove(index)}>
              Remove achievement {index + 1}
            </Button>
          </div>
        </Card>
      ))}
      <div>
        <Button
          variant="outline"
          disabled={fields.length >= 12}
          onClick={() => append({ title: '' })}
        >
          Add achievement
        </Button>
      </div>
    </fieldset>
  );
}

function LinkFields({ fields, register, append, remove }) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-lg font-semibold">Professional links</legend>
      <Field label="Professional website">
        <TextInput
          type="url"
          pattern={https}
          maxLength={2048}
          {...register('website')}
        />
      </Field>
      {fields.map(({ id }, index) => (
        <Card key={id} className="grid min-w-0 gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Link type">
              <Select {...register('links.' + index + '.kind')}>
                {Object.entries(linkKinds).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link label">
              <TextInput
                {...register('links.' + index + '.label')}
                maxLength={60}
                required
              />
            </Field>
          </div>
          <Field label="Link URL">
            <TextInput
              type="url"
              pattern={https}
              maxLength={2048}
              {...register('links.' + index + '.url')}
              required
            />
          </Field>
          <div>
            <Button variant="outline" onClick={() => remove(index)}>
              Remove link {index + 1}
            </Button>
          </div>
        </Card>
      ))}
      <div>
        <Button
          variant="outline"
          disabled={fields.length >= 8}
          onClick={() => append({ kind: 'social', label: '', url: '' })}
        >
          Add link
        </Button>
      </div>
    </fieldset>
  );
}

export function TalentForm({
  profile,
  admin = false,
  create = false,
  category,
  change,
  submit,
  label = 'Save profile',
}) {
  const { register, handleSubmit, control, getValues } = useForm({
    defaultValues: {
      categories: profile?.categories ?? (category ? [category] : []),
      professionalBackground: profile?.professionalBackground ?? '',
      expertise: profile?.expertise ?? '',
      displayName: profile?.displayName ?? '',
      alternativeName: profile?.alternativeName ?? '',
      introduction: profile?.introduction ?? '',
      biography: profile?.biography ?? '',
      location: profile?.location ?? '',
      professions: profile?.professions ?? [],
      website: profile?.website ?? '',
      links: profile?.links ?? [],
      achievements: profile?.achievements ?? [],
    },
  });
  const links = useFieldArray({ name: 'links', control });
  const achievements = useFieldArray({ name: 'achievements', control });
  const [portrait, setPortrait] = useState(
    profile?.profileImageId ?? (admin ? profile?.profileImage?.id : '') ?? '',
  );
  const [cover, setCover] = useState(
    profile?.coverImageId ?? (admin ? profile?.coverImage?.id : '') ?? '',
  );
  const [error, setError] = useState('');
  const uploadUrl = admin ? '/admin/media' : '/submissions/talent-images';

  const [duplicate, setDuplicate] = useState('');
  const duplicates = useQuery({
    queryKey: ['/admin/talent/duplicates', duplicate],
    enabled: admin && duplicate.length >= 3,
    queryFn: ({ signal }) =>
      get('/admin/talent/duplicates', signal, { name: duplicate }).then(
        (result) => result.data,
      ),
  });
  function save(values) {
    const selected = Array.isArray(values.professions)
      ? values.professions
      : [];
    if (!selected.length) return setError('Choose at least one profession.');
    if (
      [portrait, cover].some(
        (id) => id && !new RegExp('^' + allowedId + '$').test(id),
      )
    ) {
      return setError('Enter a valid media library ID or remove it.');
    }
    const displayName = optional(values.displayName);
    const introduction = optional(values.introduction);
    if (!displayName || !introduction)
      return setError('Enter a display name and short introduction.');
    setError('');
    submit({
      displayName,
      introduction,
      professions: selected,
      alternativeName: optional(values.alternativeName),
      biography: optional(values.biography),
      location: optional(values.location),
      website: optional(values.website),
      profileImageId: portrait || undefined,
      coverImageId: cover || undefined,
      links: values.links.map((entry) => ({
        ...entry,
        label: entry.label.trim(),
        url: entry.url.trim(),
      })),
      achievements: values.achievements.map((entry) => ({
        title: entry.title.trim(),
        organization: optional(entry.organization),
        year: entry.year ? Number(entry.year) : undefined,
        description: optional(entry.description),
        source: optional(entry.source),
      })),
      ...(admin && {
        categories: Array.isArray(values.categories) ? values.categories : [],
        professionalBackground: optional(values.professionalBackground),
        expertise: optional(values.expertise),
      }),
      ...(admin && create && { slug: optional(values.slug) }),
    });
  }

  return (
    <>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <ImageField
          label="Profile image"
          url={uploadUrl}
          value={portrait}
          image={profile?.profileImage}
          onChange={setPortrait}
          admin={admin}
        />
        <ImageField
          label="Cover image"
          url={uploadUrl}
          value={cover}
          image={profile?.coverImage}
          onChange={setCover}
          admin={admin}
          cover
        />
      </div>
      <Card className="min-w-0">
        <form className="grid grid-cols-1 gap-5" onSubmit={handleSubmit(save)}>
          {!admin && (
            <p className="text-sm text-muted">
              Submit only information and images you have permission to share
              publicly.
            </p>
          )}
          {admin && (
            <fieldset className="grid gap-2">
              <legend className="mb-2 font-semibold">Profile categories</legend>
              {Object.entries(talentCategories).map(([key, name]) => (
                <label
                  key={key}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <Checkbox value={key} {...register('categories')} /> {name}
                </label>
              ))}
              <Field label="Professional background (optional)">
                <Textarea
                  maxLength={1500}
                  {...register('professionalBackground')}
                />
              </Field>
              <Field label="Expertise or topics (optional)">
                <TextInput maxLength={500} {...register('expertise')} />
              </Field>
            </fieldset>
          )}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <TextInput
                required
                maxLength={100}
                {...register('displayName')}
              />
            </Field>
            {admin && (
              <div className="grid gap-2">
                <div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDuplicate(getValues('displayName').trim())
                    }
                  >
                    Check for matching names
                  </Button>
                </div>
                {duplicates.data
                  ?.filter(({ id }) => id !== profile?.id)
                  .map((row) => (
                    <DetailLink key={row.id} to={'/admin/talent/' + row.id}>
                      {row.displayName} ({row.status})
                    </DetailLink>
                  ))}
                {duplicates.isSuccess &&
                  !duplicates.data.some(({ id }) => id !== profile?.id) && (
                    <p className="text-sm text-muted">
                      No matching names found.
                    </p>
                  )}
                {duplicates.isError && (
                  <p role="alert">{duplicates.error.message}</p>
                )}
              </div>
            )}
            <Field label="Alternative or professional name">
              <TextInput maxLength={100} {...register('alternativeName')} />
            </Field>
            <Field label="Broad location">
              <TextInput maxLength={100} {...register('location')} />
            </Field>
            {admin && create && (
              <Field label="Public slug (optional)">
                <TextInput
                  pattern="[a-z0-9]+(?:\x2D[a-z0-9]+)*"
                  maxLength={90}
                  {...register('slug')}
                />
              </Field>
            )}
          </div>
          <Field label="Short professional introduction">
            <Textarea
              rows={2}
              required
              maxLength={240}
              {...register('introduction')}
            />
          </Field>
          <Field label="Biography">
            <Textarea rows={5} maxLength={5000} {...register('biography')} />
          </Field>
          <fieldset className="min-w-0">
            <legend className="mb-2 font-semibold">Professions</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {professionOptions.map(([value, label]) => (
                <label
                  className="flex min-h-11 min-w-0 items-center gap-2 text-sm"
                  key={value}
                >
                  <Checkbox value={value} {...register('professions')} />{' '}
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <AchievementFields {...achievements} register={register} />
          <LinkFields {...links} register={register} />
          {(error || change.isError) && (
            <p role="alert" className="text-sm text-danger-text">
              {error || change.error.message}
            </p>
          )}
          {change.isSuccess && !error && (
            <p role="status" className="text-sm text-success">
              Changes saved.
            </p>
          )}
          <div>
            <Button type="submit" loading={change.isPending}>
              {label}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}

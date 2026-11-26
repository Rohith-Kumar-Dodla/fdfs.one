import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../../components/ui/Button.jsx';
import { Card, SectionHeading } from '../../components/ui/surfaces.jsx';
import { EmptyState } from '../../components/ui/states.jsx';
import { control, date, get, QueryState } from '../admin/common.jsx';
import { Breakdown, StatCards } from './OpsAdmin.jsx';
const field = 'grid min-w-0 gap-1 text-sm';
const dateOnly = (value) => (value ? date(value) : 'Unavailable');
const trends = [
  ['pages', 'Page views', '#FACC15'],
  ['active', 'Active accounts', '#ffffff'],
  ['playback', 'Observed playback starts', '#9CA3AF'],
  ['registrations', 'Registrations', '#7dd3fc'],
  ['tickets', 'Support tickets', '#a7f3d0'],
];
export function HistoricalAnalytics() {
  const [range, setRange] = useState({ days: 30 });
  const [custom, setCustom] = useState(false);
  const query = useQuery({
    queryKey: ['/admin/analytics', range],
    queryFn: ({ signal }) => get('/admin/analytics', signal, range),
  });
  return (
    <>
      <SectionHeading as="h1">Analytics</SectionHeading>
      <form
        className="grid min-w-0 items-end gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setRange(
            custom
              ? { from: form.get('from'), to: form.get('to') }
              : { days: Number(form.get('days')) },
          );
        }}
      >
        <label className={field}>
          Reporting period
          <select
            name="days"
            className={control}
            defaultValue="30"
            onChange={(event) => setCustom(event.target.value === 'custom')}
          >
            <option value="1">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {custom && (
          <>
            <label className={field}>
              From
              <input className={control} type="date" name="from" required />
            </label>
            <label className={field}>
              Through
              <input className={control} type="date" name="to" required />
            </label>
          </>
        )}
        <div>
          <Button type="submit">Apply dates</Button>
        </div>
      </form>
      <QueryState query={query}>
        {(report) => (
          <>
            <p className="text-sm text-muted">
              Reporting timezone {report.timezone}. Collection began{' '}
              {dateOnly(report.firstAt)}. Last aggregation{' '}
              {dateOnly(report.lastAt)}.
            </p>
            <p className="text-sm text-muted">
              Playback starts come from player events observed by the client.
              The first collected day and current day may be partial.
            </p>
            {(!report.enabled || !report.firstAt) && (
              <EmptyState
                title={
                  report.enabled
                    ? 'No analytics collected yet'
                    : 'Analytics collection is disabled'
                }
              />
            )}
            <StatCards
              rows={[
                ['Distinct active accounts in this period', report.distinct],
              ]}
            />
            <Card className="grid min-w-0 gap-2">
              <h2 className="text-lg font-semibold">Activity by day</h2>
              <div className="h-72 min-w-0" aria-label="Activity trend chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={report.rows}>
                    <CartesianGrid stroke="#374151" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(day) => day.slice(5)}
                      tick={{ fill: '#9CA3AF', fontSize: 12 }}
                      minTickGap={20}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={34}
                      tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#111827',
                        borderColor: '#374151',
                      }}
                    />
                    <Legend />
                    {trends.map(([key, label, color]) => (
                      <Line
                        key={key}
                        dataKey={key}
                        name={label}
                        stroke={color}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <details className="min-w-0 rounded-panel border border-line p-3">
              <summary className="min-h-11 cursor-pointer font-semibold">
                Daily figures as a table
              </summary>
              <table className="w-full table-fixed text-left text-xs sm:text-sm">
                <caption className="sr-only">Daily analytics</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    {trends.map(([key, label]) => (
                      <th className="p-1 wrap-anywhere" scope="col" key={key}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.day} className="border-t border-line">
                      <th
                        scope="row"
                        className="py-2 font-normal wrap-anywhere"
                      >
                        {row.day}
                        {row.partial && ' *'}
                      </th>
                      {trends.map(([key]) => (
                        <td key={key} className="p-1 wrap-anywhere">
                          {row[key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted">
                * Partial reporting day. A dash indicates missing data.
              </p>
            </details>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <Breakdown
                title="Module engagement"
                entries={report.modules.map(({ _id, count }) => [_id, count])}
              />
              <Breakdown
                title="Device categories"
                entries={report.devices.map(({ _id, count }) => [_id, count])}
              />
              <Breakdown
                title="Popular published content"
                entries={report.popular.map(({ module, slug, count }) => [
                  module + '/' + slug,
                  count,
                ])}
                label="Published content"
              />
              <Breakdown
                title="Live event page engagement"
                entries={report.liveEvents.map(({ slug, count }) => [
                  slug,
                  count,
                ])}
                label="Event"
              />
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { buttonClasses } from '../../components/ui/Button.jsx';
import { apiClient } from '../../api/client.js';

const consentKey = 'fdfs.analytics';
const visitKey = 'fdfs.campaign.visit';
let memoryVisit;
const sent = new Set();
function visit() {
  if (memoryVisit) return memoryVisit;
  memoryVisit = crypto.randomUUID();
  try {
    const stored = sessionStorage.getItem(visitKey);
    if (stored) memoryVisit = stored;
    else sessionStorage.setItem(visitKey, memoryVisit);
  } catch {
    /* An in-memory visit is enough for deduplication. */
  }
  return memoryVisit;
}
function readConsent() {
  try {
    return localStorage.getItem(consentKey) === 'allow';
  } catch {
    return false;
  }
}
export function useCampaign(item, enabled = true) {
  const node = useRef(null);
  const [allowed, setAllowed] = useState(readConsent);
  const id = item?.module === 'promotion' ? item.id : undefined;
  const placement = item?.placement;
  function log(kind) {
    if (!enabled || !allowed || !id || !placement || document.hidden) return;
    const key = kind + ':' + id + ':' + placement;
    if (sent.has(key)) return;
    if (sent.size >= 250) sent.delete(sent.values().next().value);
    sent.add(key);
    void apiClient
      .post('/homepage/campaign-events', {
        campaign: id,
        placement,
        visit: visit(),
        kind,
        consent: true,
      })
      .catch(() => sent.delete(key));
  }
  const send = useRef(log);
  useEffect(() => {
    send.current = log;
  });
  useEffect(() => {
    const same = (event) => setAllowed(event.detail === true);
    const other = (event) => {
      if (event.key === consentKey || event.key === null)
        setAllowed(readConsent());
    };
    window.addEventListener('fdfs:consent', same);
    window.addEventListener('storage', other);
    return () => {
      window.removeEventListener('fdfs:consent', same);
      window.removeEventListener('storage', other);
    };
  }, []);
  useEffect(() => {
    if (
      !id ||
      !placement ||
      !enabled ||
      !allowed ||
      !node.current ||
      typeof IntersectionObserver !== 'function'
    )
      return;
    let timer;
    let visible = false;
    const manage = () => {
      clearTimeout(timer);
      if (visible && !document.hidden)
        timer = setTimeout(() => send.current('impression'), 1000);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        manage();
      },
      { threshold: 0.5 },
    );
    observer.observe(node.current);
    document.addEventListener('visibilitychange', manage);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', manage);
    };
  }, [id, placement, enabled, allowed]);
  return { node, click: () => log('click') };
}

export function Destination({ action, click, style = 'primary' }) {
  if (!action) return null;
  const className = buttonClasses(
    style,
    'max-w-full whitespace-normal wrap-anywhere',
  );
  return action.external ? (
    <a
      href={action.href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={className}
      onClick={click}
      onAuxClick={(event) => {
        if (event.button === 1) click?.();
      }}
    >
      {action.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link className={className} to={action.href} onClick={click}>
      {action.label}
    </Link>
  );
}
const sizes = '(min-width: 90rem) 1440px, 100vw';
const set = (image) =>
  image?.variants?.map((item) => item.url + ' ' + item.width + 'w').join(', ');
const focal = {
  left: 'object-left',
  right: 'object-right',
  top: 'object-top',
  bottom: 'object-bottom',
  center: 'object-center',
};
export function CinematicArtwork({
  image,
  mobile,
  fallback,
  alt = '',
  position = 'center',
  priority = false,
}) {
  if (!image?.url && !fallback) return null;
  return (
    <picture>
      {mobile?.url && (
        <source
          media="(max-width: 639px)"
          srcSet={set(mobile) ?? mobile.url}
          sizes="100vw"
        />
      )}
      <img
        src={image?.url ?? fallback}
        srcSet={set(image)}
        sizes={sizes}
        alt={alt}
        width={image?.width}
        height={image?.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        className={
          'absolute inset-0 h-full w-full object-cover ' +
          (focal[position] ?? focal.center)
        }
      />
    </picture>
  );
}
export function CampaignBanner({
  item,
  compact = false,
  preview = false,
  previewSize,
}) {
  const track = useCampaign(item, !preview);
  const image =
    previewSize === 'mobile' ? (item.mobile ?? item.image) : item.image;
  return (
    <article
      ref={track.node}
      className={
        'relative isolate grid min-w-0 content-end overflow-hidden rounded-panel border border-line bg-surface ' +
        (compact ? 'h-full min-h-44' : 'min-h-48 sm:min-h-56')
      }
    >
      <CinematicArtwork
        image={image}
        mobile={previewSize ? undefined : item.mobile}
        position={item.focal}
        alt={item.alt}
      />
      {image && (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-0 bg-linear-to-t from-black via-black/75 to-black/25"
        />
      )}
      <div className="relative grid min-w-0 gap-2 p-4 text-white wrap-anywhere sm:p-6">
        {item.sponsor && (
          <p className="text-xs font-semibold text-accent">
            Sponsored by {item.sponsor}
          </p>
        )}
        <h3 className="text-xl font-bold">{item.title}</h3>
        {item.summary && !compact && (
          <p className="max-w-copy text-sm text-gray-200">{item.summary}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Destination
            action={item.primary}
            click={preview ? undefined : track.click}
          />
          <Destination
            action={item.secondary}
            click={preview ? undefined : track.click}
            style="outline"
          />
        </div>
      </div>
    </article>
  );
}

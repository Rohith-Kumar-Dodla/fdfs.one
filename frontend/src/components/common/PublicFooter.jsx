import { Link } from 'react-router';
import { legalSections } from '../../../../shared/site.js';
import { AnalyticsPreferences } from '../../features/operations/Realtime.jsx';
import { modules } from '../../routes/modules.js';
import { Container } from '../ui/surfaces.jsx';

const link =
  'inline-flex min-h-11 items-center text-sm text-muted hover:text-accent focus-visible:text-accent wrap-anywhere';
export function PublicFooter({ settings }) {
  return (
    <footer className="border-t border-line/60 bg-nav">
      <Container className="max-w-[112rem]! pt-9 pb-5">
        <div className="grid min-w-0 gap-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr]">
          <div className="grid min-w-0 content-start gap-3">
            <Link
              to="/"
              className="w-fit text-xl font-extrabold tracking-tight"
            >
              {settings.name === 'FDFS.ONE' ? (
                <>
                  FDFS<span className="text-accent">.ONE</span>
                </>
              ) : (
                settings.name
              )}
            </Link>
            <p className="max-w-md text-sm leading-relaxed text-muted wrap-anywhere">
              {settings.description}
            </p>
            {settings.socials.length > 0 && (
              <div className="flex flex-wrap gap-x-4">
                {settings.socials.map(({ label, url }) => (
                  <a key={label + url} href={url} className={link}>
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>
          <nav aria-label="Quick Links" className="min-w-0">
            <h2 className="mb-2 font-bold">Quick Links</h2>
            <ul className="grid grid-cols-2 gap-x-2">
              {[{ label: 'Home', path: '/' }, ...modules]
                .filter(({ path }) => !settings.hiddenModules.includes(path))
                .map(({ path, label }) => (
                  <li key={path}>
                    <Link to={path} className={link}>
                      {label}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
          <nav aria-label="Legal and Support" className="min-w-0">
            <h2 className="mb-2 font-bold">Legal and Support</h2>
            <ul className="grid">
              {Object.entries(legalSections)
                .filter(([key]) => settings.legal[key])
                .map(([key, label]) => (
                  <li key={key}>
                    <Link to={'/legal/' + key} className={link}>
                      {label}
                    </Link>
                  </li>
                ))}
              <li>
                <Link to="/support" className={link}>
                  Support Center
                </Link>
              </li>
              {settings.links.map(({ label, url }) => (
                <li key={label + url}>
                  <a className={link} href={url}>
                    {label}
                  </a>
                </li>
              ))}
              {settings.supportEmail && (
                <li>
                  <a className={link} href={'mailto:' + settings.supportEmail}>
                    {settings.supportEmail}
                  </a>
                </li>
              )}
            </ul>
            {settings.contact && (
              <p className="mt-2 text-sm text-muted wrap-anywhere">
                {settings.contact}
              </p>
            )}
          </nav>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-5 text-sm text-muted">
          <small className="wrap-anywhere">
            © {new Date().getFullYear()} {settings.name}
            {settings.footer && ' · ' + settings.footer}
          </small>
          <AnalyticsPreferences />
        </div>
      </Container>
    </footer>
  );
}

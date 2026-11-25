import { Link, useRouteError, isRouteErrorResponse } from 'react-router';
import { buttonClasses } from '../components/ui/Button.jsx';
import { Spinner } from '../components/ui/states.jsx';
import { Container, SectionHeading } from '../components/ui/surfaces.jsx';

export function RouteLoading() {
  return (
    <Container className="py-14">
      <Spinner label="Loading FDFS" />
    </Container>
  );
}

export function NotFound() {
  return (
    <Container className="grid justify-items-start gap-6 py-14 sm:py-20">
      <SectionHeading
        as="h1"
        description="Check the address or return to the FDFS homepage."
      >
        Page not found
      </SectionHeading>
      <Link to="/" className={buttonClasses()}>
        Back to home
      </Link>
    </Container>
  );
}

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;

  return (
    <Container className="grid justify-items-start gap-6 py-14 sm:py-20">
      <div role="alert">
        <SectionHeading
          as="h1"
          description="Reload the page to try again or return to the FDFS homepage."
        >
          This page could not load
        </SectionHeading>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClasses()}
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
        <Link to="/" className={buttonClasses('outline')}>
          Back to home
        </Link>
      </div>
    </Container>
  );
}

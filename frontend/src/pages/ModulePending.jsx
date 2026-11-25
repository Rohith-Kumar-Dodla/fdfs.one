import { Link, useMatches } from 'react-router';
import { buttonClasses } from '../components/ui/Button.jsx';
import { EmptyState } from '../components/ui/states.jsx';
import { Container, SectionHeading } from '../components/ui/surfaces.jsx';

export default function ModulePending() {
  const {
    handle: { module },
  } = useMatches().at(-1);

  return (
    <Container className="grid gap-7 py-12 sm:py-16">
      <SectionHeading as="h1" description={module.description}>
        {module.label}
      </SectionHeading>
      <EmptyState
        title="Content is not available yet"
        description={`The ${module.label} section is still in development.`}
      >
        <Link to="/#explore" className={buttonClasses('outline')}>
          Explore FDFS
        </Link>
      </EmptyState>
    </Container>
  );
}

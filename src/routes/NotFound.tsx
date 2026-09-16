import { ErrorScreen } from './Shell';

export function NotFound() {
  return <ErrorScreen title="Nothing on this table" message="That link doesn't point anywhere on the menu." />;
}

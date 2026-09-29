import { usePageTitle } from '../state/usePageTitle';
import { ErrorScreen } from './Shell';

export function NotFound() {
  usePageTitle("Page not found · Let's Dine");
  return <ErrorScreen title="Nothing on this table" message="That link doesn't point anywhere on the menu." />;
}

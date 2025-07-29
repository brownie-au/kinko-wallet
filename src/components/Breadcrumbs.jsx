import { useLocation } from 'react-router-dom';

export default function Breadcrumbs() {
  const location = useLocation();

  // Globally disable breadcrumbs
  return null;
}

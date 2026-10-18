import { Component, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import Loader from './Loader';

class PageBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <section className="kw-route-error" role="alert">
          <h2>This page couldn’t load</h2>
          <p>
            A connection interruption or an app update may have caused this. Reload to try again. Your saved wallets will stay on this
            device.
          </p>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

const Loadable = (Page) =>
  function LoadablePage(props) {
    const location = useLocation();
    return (
      <PageBoundary key={location.pathname}>
        <Suspense fallback={<Loader />}>
          <Page {...props} />
        </Suspense>
      </PageBoundary>
    );
  };

export default Loadable;

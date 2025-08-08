import { useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// react-bootstrap
import Container from 'react-bootstrap/Container';
import Image from 'react-bootstrap/Image';
import Navbar from 'react-bootstrap/Navbar';

// assets
import Logo from 'assets/images/logo-white.svg';

// ==============================|| SIMPLE - HEADER ||============================== //

export default function HeaderSection() {
  const navbarRef = useRef(null);

  const handleScroll = useCallback(() => {
    if (navbarRef.current) {
      navbarRef.current.classList.toggle('default', window.scrollY === 0);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <Navbar expand="md" className="navbar default" ref={navbarRef}>
      <Container className="d-flex align-items-center">
        {/* Brand on the left */}
        <Navbar.Brand as={Link} to="/" className="d-flex align-items-center">
          <Image src={Logo} alt="Kinko Wallet" height={36} />
        </Navbar.Brand>

        {/* No right-side template links */}
        <div className="ms-auto" />
      </Container>
    </Navbar>
  );
}

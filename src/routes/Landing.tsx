import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageTitle } from '../state/usePageTitle';
import { LandingNav } from './landing/Nav';
import { Hero } from './landing/Hero';
import { Marquee } from './landing/Marquee';
import { Problem } from './landing/Problem';
import { ProductIntro } from './landing/ProductIntro';
import { TaglineReveal } from './landing/TaglineReveal';
import { DishIntelligence } from './landing/DishIntelligence';
import { CustomerExperience } from './landing/CustomerExperience';
import { OrderingFlow } from './landing/OrderingFlow';
import { Dashboard } from './landing/Dashboard';
import { MenuManagement } from './landing/MenuManagement';
import { Reviews } from './landing/Reviews';
import { GrowthLoop } from './landing/GrowthLoop';
import { RestaurantTypes } from './landing/RestaurantTypes';
import { FinalCta } from './landing/FinalCta';
import { LandingFooter } from './landing/LandingFooter';
import { ScrollTrigger, scrollToSection, useRefreshOnLoad, useSmoothScroll } from './landing/motion';

const PAPER = '#f6f1e7';
const DINER = '#12100e';

/**
 * The marketing homepage — what a restaurant owner sees at `/`. The live
 * product itself (the QR table simulator) lives at `/demo`, so the two never
 * compete for the same route.
 *
 * The product app runs on a dark table all day; this page is a printed object,
 * so it flips the whole token set to cream stock and near-black ink for as
 * long as it is mounted. `data-page` is the switch, set the same way the
 * dashboard sets `data-admin-theme`, and it is removed on the way out so the
 * diner routes are never left holding it.
 */
export function Landing() {
  const { hash } = useLocation();

  usePageTitle(
    'FeastoX · A smarter way to dine, a smarter way to run a restaurant',
    'Digital menus, QR table ordering and dish level ratings, built from real orders. See what your customers actually think about every dish.',
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    root.setAttribute('data-page', 'landing');
    meta?.setAttribute('content', PAPER);

    return () => {
      root.removeAttribute('data-page');
      meta?.setAttribute('content', DINER);
      // Pinned sections leave inline styles on the elements they pinned; this
      // is what takes them back off when the visitor navigates into the app.
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  useSmoothScroll();
  useRefreshOnLoad();

  // Nav links from other marketing routes arrive as `/#section`. The app shell
  // scrolls to the top on every navigation, so this runs a frame later and
  // lands on the section that link named.
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => scrollToSection(hash));
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <LandingNav />
      <main id="main">
        <Hero />
        <Marquee />
        <Problem />
        <ProductIntro />
        <TaglineReveal />
        <DishIntelligence />
        <CustomerExperience />
        <OrderingFlow />
        <Dashboard />
        <MenuManagement />
        <Reviews />
        <GrowthLoop />
        <RestaurantTypes />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}

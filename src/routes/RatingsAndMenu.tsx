import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import features from '../content/features.json';
import { usePageTitle } from '../state/usePageTitle';
import { LandingNav } from './landing/Nav';
import { RatingsHero } from './landing/RatingsHero';
import { Problem } from './landing/Problem';
import { ProductIntro } from './landing/ProductIntro';
import { DishIntelligence } from './landing/DishIntelligence';
import { CustomerExperience } from './landing/CustomerExperience';
import { OrderingFlow } from './landing/OrderingFlow';
import { MenuManagement } from './landing/MenuManagement';
import { Reviews } from './landing/Reviews';
import { GrowthLoop } from './landing/GrowthLoop';
import { Faq } from './landing/Faq';
import { FinalCta } from './landing/FinalCta';
import { LandingFooter } from './landing/LandingFooter';
import { ScrollTrigger, scrollToSection, useRefreshOnLoad, useSmoothScroll } from './landing/motion';

const SLUG = 'dish-ratings-and-qr-menu';
const page = features.find((f) => f.slug === SLUG)!;

/**
 * The diner-facing story: the QR menu, table ordering and purchase-verified dish ratings.
 * It used to be most of the homepage; the homepage now leads with running the whole restaurant.
 * Copy for the title, description and FAQ lives in `content/features.json`, which prerender also reads.
 */
export function RatingsAndMenu() {
  const { hash } = useLocation();
  usePageTitle(page.title, page.description, page.keywords);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    root.setAttribute('data-page', 'landing');
    meta?.setAttribute('content', '#f6f1e7');
    return () => {
      root.removeAttribute('data-page');
      meta?.setAttribute('content', '#12100e');
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  useSmoothScroll();
  useRefreshOnLoad();

  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => scrollToSection(hash));
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <LandingNav />
      <main id="main">
        <RatingsHero />
        <Problem />
        <ProductIntro />
        <DishIntelligence />
        <CustomerExperience />
        <OrderingFlow />
        <MenuManagement />
        <Reviews />
        <GrowthLoop />
        <Faq faqs={page.faqs} heading="Questions about the QR menu and ratings." />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}

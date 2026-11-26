export type Category = "ads" | "home" | "inGame" | "multiplayer";

export interface Rule {
  selector: string;
  category: Category;
  url_paths?: string[];
}

// Only third-party nodes are removed: React does not own them, so removing them
// cannot break its reconciliation.
export const DIRECT_BLOCK_CONFIG: Rule[] = [
  { selector: 'iframe[name="__tcfapiLocator"]', category: "ads" },
  { selector: 'iframe[name="__uspapiLocator"]', category: "ads" },
  { selector: 'iframe[name="__adconsentLocator"]', category: "ads" },
  { selector: 'iframe[name="googlefcPresent"]', category: "ads" },
  { selector: 'iframe[src*="criteo.com"]', category: "ads" },
  { selector: "#confiant_tag_holder", category: "ads" },
  { selector: ".snigel-adhesive", category: "ads" },
  { selector: "#adconsent-usp-banner-btn", category: "ads" },
];

// Hides without collapsing layout space.
export const CSS_HIDING_SELECTORS: Rule[] = [
  {
    selector: '[class*="home_left__"], [class*="pro-user-start-page_left__"], [class*="_left_"]',
    category: "home",
  },
];

// React owns these nodes. Removing them makes React throw removeChild errors on
// the next render (for example when a guess shows the round result), so they are
// collapsed with CSS instead.
export const CSS_COLLAPSE_SELECTORS: Rule[] = [
  {
    selector:
      '[class*="team-v2-matchmaking-layout_footer__"], [class*="ranked-v2-matchmaking-layout_footer__"], [class*="unranked-v2-matchmaking-layout_footer__"], [class*="team-matchmaking-layout_footer__"], [class*="ranked-matchmaking-layout_footer__"], [class*="unranked-matchmaking-layout_footer__"], [class*="_footerEnter_"]',
    category: "multiplayer",
  },
  {
    selector: '[class*="styles_friendChatButton__"], [class*="_friendChatButton_"]',
    category: "inGame",
  },
  {
    selector: '[class*="_contacts_"]:has([class*="_friendIcon_"])',
    category: "inGame",
  },
  {
    selector: '[class*="_controlGroup_"]:has([data-qa="pano-zoom-in"])',
    category: "inGame",
  },
  {
    selector:
      '[class*="home_footer__"], [class*="new-losp-footer_root__"], [class*="footer_footer__"], [class*="_footer_"]',
    category: "home",
    url_paths: ["/"],
  },
  {
    selector:
      '[class*="home_editButtonWrapper__"], [class*="pro-user-start-page_editButtonWrapper__"], [class*="_editButtonWrapper_"]',
    category: "home",
  },
  {
    selector:
      '[class*="profile-v2_widgetRow__"]:has([class*="widget_explorer__"]), [class*="_widgetRow_"]:has([class*="_explorer_"])',
    category: "home",
  },
];

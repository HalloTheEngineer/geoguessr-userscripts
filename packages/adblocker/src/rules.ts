export type Category = "ads" | "home" | "inGame" | "multiplayer";

export interface Rule {
  selector: string;
  category: Category;
  url_paths?: string[];
}

export interface AncestorRule {
  selector: string;
  ancestor: string;
  category: Category;
}

export interface StructuralRule {
  source: string;
  target: string;
  reverseOrder: boolean;
  category: Category;
}

export const DIRECT_BLOCK_CONFIG: Rule[] = [
  { selector: '[class*="team-v2-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="ranked-v2-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="unranked-v2-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="team-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="ranked-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="unranked-matchmaking-layout_footer__"]', category: "multiplayer" },
  { selector: '[class*="_footerEnter_"]', category: "multiplayer" },
  { selector: '[class*="styles_friendChatButton__"]', category: "inGame" },
  { selector: '[class*="_friendChatButton_"]', category: "inGame" },
  { selector: '[class*="home_footer__"]', category: "home", url_paths: ["/"] },
  { selector: '[class*="new-losp-footer_root__"]', category: "home", url_paths: ["/"] },
  { selector: '[class*="footer_footer__"]', category: "home", url_paths: ["/"] },
  { selector: '[class*="_footer_"]', category: "home", url_paths: ["/"] },
  { selector: '[class*="home_editButtonWrapper__"]', category: "home" },
  { selector: '[class*="pro-user-start-page_editButtonWrapper__"]', category: "home" },
  { selector: '[class*="_editButtonWrapper_"]', category: "home" },
  { selector: 'iframe[name="__tcfapiLocator"]', category: "ads" },
  { selector: 'iframe[name="__uspapiLocator"]', category: "ads" },
  { selector: 'iframe[name="__adconsentLocator"]', category: "ads" },
  { selector: 'iframe[name="googlefcPresent"]', category: "ads" },
  { selector: 'iframe[src*="criteo.com"]', category: "ads" },
  { selector: "#confiant_tag_holder", category: "ads" },
  { selector: ".snigel-adhesive", category: "ads" },
  { selector: "#adconsent-usp-banner-btn", category: "ads" },
];

export const CSS_HIDING_SELECTORS: Rule[] = [
  {
    selector: '[class*="home_left__"], [class*="pro-user-start-page_left__"], [class*="_left_"]',
    category: "home",
  },
];

export const ANCESTOR_BLOCK_CONFIG: AncestorRule[] = [
  {
    selector: '[class*="_friendIcon_"]',
    ancestor: '[class*="_contacts_"]',
    category: "inGame",
  },
  {
    selector: '[data-qa="pano-zoom-in"]',
    ancestor: '[class*="_controlGroup_"]',
    category: "inGame",
  },
  {
    selector: '[class*="widget_explorer__"]',
    ancestor: '[class*="profile-v2_widgetRow__"]',
    category: "home",
  },
  {
    selector: '[class*="_explorer_"]',
    ancestor: '[class*="_widgetRow_"]',
    category: "home",
  },
];

export const STRUCTURAL_MAPPINGS: StructuralRule[] = [
  {
    source: '[class*="styles_columnTwo__"]',
    target: '[class*="styles_columnOne__"]',
    reverseOrder: true,
    category: "inGame",
  },
  {
    source: '[class*="_columnTwo_"]',
    target: '[class*="_columnOne_"]',
    reverseOrder: true,
    category: "inGame",
  },
  {
    source: '[class*="_chatInput_"]',
    target: '[class*="_columnOne_"]',
    reverseOrder: false,
    category: "inGame",
  },
];
